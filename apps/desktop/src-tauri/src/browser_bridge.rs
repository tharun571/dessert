/// Localhost HTTP bridge on 127.0.0.1:43137
///
/// Receives BrowserActivitySample batches from the Arc extension.
/// Applies grace-period logic and emits score events.
///
/// Grace logic per site:
///   - First 5 min of active scroll per visit → neutral
///   - After that → penalty per full minute (-3 in session, -1 ambient)
///   - Visit resets if away from site for 90 seconds
///   - Penalty suppressed if a bought break effect is active

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use chrono::Utc;
use uuid::Uuid;

// ── Types from the extension ──────────────────────────────────────────────────

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserActivitySample {
    pub event_id: String,
    pub ts: String,
    pub domain: String,
    pub path: String,
    pub title: Option<String>,
    pub visible: bool,
    pub focused: bool,
    pub sample_window_ms: u32,
    pub active_scroll_ms: u32,
    pub wheel_events: u32,
    pub key_events: u32,
}

#[derive(Debug, Deserialize)]
struct BrowserEvent {
    pub event_id: String,
    pub ts: String,
    pub event_type: String,
    pub payload: BrowserActivitySample,
}

#[derive(Debug, Deserialize)]
struct EventBatch {
    pub version: u32,
    pub events: Vec<BrowserEvent>,
}

// ── Per-domain visit state (in memory) ───────────────────────────────────────

struct SiteVisit {
    /// Timestamp of last received sample for this domain
    last_sample: Instant,
    /// Total active-scroll ms accumulated in this visit
    total_active_scroll_ms: u64,
    /// Scroll ms past the grace window, not yet billed into a full minute
    pending_penalty_ms: u64,
    /// True once we've crossed the grace threshold
    grace_exceeded: bool,
}

impl SiteVisit {
    fn new() -> Self {
        Self {
            last_sample: Instant::now(),
            total_active_scroll_ms: 0,
            pending_penalty_ms: 0,
            grace_exceeded: false,
        }
    }

    fn reset(&mut self) {
        self.total_active_scroll_ms = 0;
        self.pending_penalty_ms = 0;
        self.grace_exceeded = false;
        self.last_sample = Instant::now();
    }
}

pub struct BridgeState {
    visits: HashMap<String, SiteVisit>,
    /// domain → was_penalized_last_tick (for recovery bonus)
    was_penalized: HashMap<String, bool>,
}

impl BridgeState {
    pub fn new() -> Self {
        Self {
            visits: HashMap::new(),
            was_penalized: HashMap::new(),
        }
    }
}

const VISIT_RESET_SECS: u64 = 90;

// ── Domain helpers ────────────────────────────────────────────────────────────

/// Map a full domain (e.g. "www.youtube.com") to the canonical key we use in site_rules
fn canonical_domain(domain: &str) -> &str {
    // Strip "www." prefix for matching
    if let Some(stripped) = domain.strip_prefix("www.") {
        stripped
    } else {
        domain
    }
}

/// Map a domain to the suppression scope stored in active_effects
fn domain_to_scope(domain: &str) -> Option<&'static str> {
    match canonical_domain(domain) {
        "x.com" | "twitter.com" => Some("x"),
        "youtube.com" => Some("youtube"),
        "linkedin.com" => Some("linkedin"),
        _ => None,
    }
}

// ── HTTP server ───────────────────────────────────────────────────────────────

pub fn start(db: Arc<Mutex<Connection>>, bridge: Arc<Mutex<BridgeState>>) {
    std::thread::spawn(move || {
        let server = match tiny_http::Server::http("127.0.0.1:43137") {
            Ok(s) => s,
            Err(e) => {
                eprintln!("[bridge] Cannot bind 127.0.0.1:43137: {e}");
                return;
            }
        };
        eprintln!("[bridge] Listening on 127.0.0.1:43137");

        for mut request in server.incoming_requests() {
            let mut body = String::new();
            let _ = request.as_reader().read_to_string(&mut body);

            let accepted = if *request.method() == tiny_http::Method::Post {
                process_batch(&body, &db, &bridge)
            } else {
                0
            };

            let json = format!(r#"{{"accepted":{accepted},"rejected":0}}"#);
            let response = tiny_http::Response::from_string(json)
                .with_header(
                    "Content-Type: application/json"
                        .parse::<tiny_http::Header>()
                        .unwrap(),
                )
                .with_header(
                    "Access-Control-Allow-Origin: *"
                        .parse::<tiny_http::Header>()
                        .unwrap(),
                );
            let _ = request.respond(response);
        }
    });
}

// ── Event processing ──────────────────────────────────────────────────────────

fn process_batch(
    body: &str,
    db: &Arc<Mutex<Connection>>,
    bridge: &Arc<Mutex<BridgeState>>,
) -> usize {
    let batch: EventBatch = match serde_json::from_str(body) {
        Ok(b) => b,
        Err(e) => {
            eprintln!("[bridge] Parse error: {e}");
            return 0;
        }
    };

    let mut accepted = 0;
    for event in &batch.events {
        if event.event_type == "browser.activity.sample" {
            process_sample(&event.payload, &event.ts, db, bridge);
            accepted += 1;
        }
    }
    accepted
}

fn process_sample(
    sample: &BrowserActivitySample,
    ts: &str,
    db: &Arc<Mutex<Connection>>,
    bridge: &Arc<Mutex<BridgeState>>,
) {
    // Only score when the tab is visible, focused, and the user scrolled
    if !sample.visible || !sample.focused || sample.active_scroll_ms == 0 {
        return;
    }

    let domain = canonical_domain(&sample.domain);
    let conn = db.lock().unwrap();

    // Look up site rule
    let rule = conn.query_row(
        "SELECT category, grace_seconds, penalty_per_minute_session, penalty_per_minute_ambient
         FROM site_rules WHERE enabled=1 AND lower(domain)=lower(?1) LIMIT 1",
        rusqlite::params![domain],
        |r| Ok((r.get::<_, String>(0)?, r.get::<_, i32>(1)?, r.get::<_, i32>(2)?, r.get::<_, i32>(3)?)),
    );

    let (category, grace_secs, penalty_session, penalty_ambient) = match rule {
        Ok(r) => r,
        Err(_) => return, // no rule for this domain
    };

    if category != "negative" {
        return;
    }

    // Check active suppression from a bought break
    let suppressed = domain_to_scope(domain).map_or(false, |scope| {
        conn.query_row(
            "SELECT COUNT(*) FROM active_effects
             WHERE scope=?1 AND consumed=0 AND datetime(ends_at) > datetime('now')",
            rusqlite::params![scope],
            |r| r.get::<_, i32>(0),
        ).map(|n| n > 0).unwrap_or(false)
    });

    if suppressed {
        return;
    }

    // Update visit state
    let mut bridge_state = bridge.lock().unwrap();
    let visit = bridge_state.visits
        .entry(domain.to_string())
        .or_insert_with(SiteVisit::new);

    // Reset visit if user was away for 90+ seconds
    if visit.last_sample.elapsed() > Duration::from_secs(VISIT_RESET_SECS) {
        visit.reset();
    }

    visit.last_sample = Instant::now();
    visit.total_active_scroll_ms += sample.active_scroll_ms as u64;

    let grace_ms = (grace_secs as u64) * 1000;
    if visit.total_active_scroll_ms <= grace_ms {
        return; // Within grace period
    }

    visit.grace_exceeded = true;

    // How much of this sample is past the grace window?
    // prev_total was before adding this sample; post_grace is what's now past grace.
    let prev_total = visit.total_active_scroll_ms - sample.active_scroll_ms as u64;
    let prev_post_grace = prev_total.saturating_sub(grace_ms);
    let cur_post_grace = visit.total_active_scroll_ms.saturating_sub(grace_ms);
    let newly_penalizable = cur_post_grace - prev_post_grace;
    visit.pending_penalty_ms += newly_penalizable;

    let full_minutes = visit.pending_penalty_ms / 60_000;
    if full_minutes == 0 {
        return;
    }
    visit.pending_penalty_ms %= 60_000;

    drop(bridge_state);
    drop(conn); // re-acquire after dropping bridge lock to avoid deadlock

    let conn = db.lock().unwrap();

    // Store raw event
    let raw_id = Uuid::new_v4().to_string();
    let payload = serde_json::to_string(sample).unwrap_or_default();
    let active_session_id: Option<String> = conn.query_row(
        "SELECT id FROM sessions WHERE state='active' ORDER BY started_at DESC LIMIT 1",
        [],
        |r| r.get(0),
    ).ok();

    let _ = conn.execute(
        "INSERT INTO raw_events (id, ts, source, event_type, payload_json, session_id)
         VALUES (?1, ?2, 'arc_ext', 'browser.activity.sample', ?3, ?4)",
        rusqlite::params![raw_id, ts, payload, active_session_id],
    );

    // Emit score event
    let now = Utc::now().to_rfc3339();
    let score_id = Uuid::new_v4().to_string();
    let (delta, reason_code, explanation) = match &active_session_id {
        Some(_) => (
            -(penalty_session * full_minutes as i32),
            "red_site_penalty",
            format!("{domain}: {full_minutes}m doomscroll during session"),
        ),
        None => (
            -(penalty_ambient * full_minutes as i32),
            "ambient_red_site_penalty",
            format!("{domain}: {full_minutes}m doomscroll outside session"),
        ),
    };

    let _ = conn.execute(
        "INSERT INTO score_events (id, ts, session_id, delta, reason_code, explanation, related_event_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![score_id, now, active_session_id, delta, reason_code, explanation, raw_id],
    );

    if let Some(ref sid) = active_session_id {
        let _ = conn.execute(
            "UPDATE sessions SET score_total = score_total + ?1 WHERE id = ?2",
            rusqlite::params![delta, sid],
        );
    }

    eprintln!("[bridge] {domain}: {full_minutes}m penalized → {delta} pts");
}
