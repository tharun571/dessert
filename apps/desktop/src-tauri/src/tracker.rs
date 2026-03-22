/// macOS frontmost-app tracker + idle detection + scoring tick loop
///
/// Polls every 60 seconds:
///   - Detects frontmost app (bundle_id + name) via lsappinfo
///   - Detects idle time via CoreGraphics CGEventSource
///   - Awards/penalises points based on app_rules and session state
///   - Tracks consecutive productive minutes for combo bonus

use std::sync::{Arc, Mutex};
use std::time::Duration;
use rusqlite::Connection;
use chrono::Utc;
use uuid::Uuid;

pub struct TrackerState {
    pub bundle_id: Option<String>,
    pub app_name: Option<String>,
    pub idle_seconds: f64,
    pub is_idle: bool,
    pub last_tick: Option<String>,
    /// Tracks which session the combo counter belongs to; used for milestone idempotency
    pub last_session_id: Option<String>,
}

impl Default for TrackerState {
    fn default() -> Self {
        Self {
            bundle_id: None,
            app_name: None,
            idle_seconds: 0.0,
            is_idle: false,
            last_tick: None,
            last_session_id: None,
        }
    }
}

/// Get the frontmost application's bundle_id and display name.
/// Uses lsappinfo which requires no special permissions.
pub fn get_frontmost_app() -> Option<(String, String)> {
    let output = std::process::Command::new("lsappinfo")
        .arg("front")
        .output()
        .ok()?;
    let text = String::from_utf8_lossy(&output.stdout);

    // First quoted token is the app name: "Finder" ASN:...
    let name = text.split('"').nth(1)?.to_string();
    if name.is_empty() {
        return None;
    }

    // Extract bundleID="..."
    let marker = "bundleID=\"";
    let start = text.find(marker)? + marker.len();
    let end = start + text[start..].find('"')?;
    let bundle_id = text[start..end].to_string();

    if bundle_id.is_empty() {
        return None;
    }

    Some((bundle_id, name))
}

/// Seconds since last keyboard/mouse activity using CoreGraphics.
/// kCGEventSourceStateHIDSystemState = 1, kCGAnyInputEventType = 0xFFFFFFFF
pub fn get_idle_seconds() -> f64 {
    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGEventSourceSecondsSinceLastEventType(stateID: i32, eventType: u32) -> f64;
    }
    unsafe { CGEventSourceSecondsSinceLastEventType(1, 0xFFFFFF_FFu32) }
}

const TICK_SECS: u64 = 60;
const AFK_THRESHOLD_SECS: f64 = 600.0; // 10 minutes


pub fn start(db: Arc<Mutex<Connection>>, tracker: Arc<Mutex<TrackerState>>) {
    std::thread::spawn(move || {
        // Stagger startup so the app UI loads first
        std::thread::sleep(Duration::from_secs(5));
        loop {
            tick(&db, &tracker);
            std::thread::sleep(Duration::from_secs(TICK_SECS));
        }
    });
}

fn tick(db: &Arc<Mutex<Connection>>, tracker: &Arc<Mutex<TrackerState>>) {
    let now = Utc::now();
    let now_str = now.to_rfc3339();

    let (bundle_id, app_name) = match get_frontmost_app() {
        Some(v) => v,
        None => {
            eprintln!("[tracker] tick: lsappinfo returned no app — skipping");
            return;
        }
    };
    let idle_secs = get_idle_seconds();
    let is_idle = idle_secs >= AFK_THRESHOLD_SECS;

    // Update tracker state
    {
        let mut t = tracker.lock().unwrap();
        t.bundle_id = Some(bundle_id.clone());
        t.app_name = Some(app_name.clone());
        t.idle_seconds = idle_secs;
        t.is_idle = is_idle;
        t.last_tick = Some(now_str.clone());
    }

    eprintln!("[tracker] tick: app=\"{}\" idle={:.0}s", app_name, idle_secs);

    if is_idle {
        eprintln!("[tracker] idle — skipping scoring");
        return;
    }

    let conn = db.lock().unwrap();

    // Emit raw event
    let raw_id = Uuid::new_v4().to_string();
    let payload = format!(
        r#"{{"bundle_id":"{}", "app_name":"{}", "idle_secs":{:.0}}}"#,
        bundle_id, app_name, idle_secs
    );
    let raw_insert_ok = conn.execute(
        "INSERT INTO raw_events (id, ts, source, event_type, payload_json, session_id)
         VALUES (?1, ?2, 'mac_app', 'frontmost_app', ?3, NULL)",
        rusqlite::params![raw_id, now_str, payload],
    ).is_ok();
    // Use raw_id as FK only if the insert succeeded; otherwise pass NULL to avoid FK violation
    let related_id: Option<&str> = if raw_insert_ok { Some(&raw_id) } else { None };

    // Look up app rule
    let rule: Option<(String, i32)> = conn.query_row(
        "SELECT category, points_per_minute FROM app_rules
         WHERE enabled=1 AND (
           (matcher_type='bundle_id' AND lower(matcher_value)=lower(?1)) OR
           (matcher_type='app_name'  AND lower(matcher_value)=lower(?2))
         )
         ORDER BY matcher_type='bundle_id' DESC LIMIT 1",
        rusqlite::params![bundle_id, app_name],
        |r| Ok((r.get(0)?, r.get(1)?)),
    ).ok();

    // Get active session
    let session: Option<(String, i32, String)> = conn.query_row(
        "SELECT id, score_total, started_at FROM sessions WHERE state='active' ORDER BY started_at DESC LIMIT 1",
        [],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
    ).ok();
    eprintln!("[tracker] active session: {:?}", session.as_ref().map(|(id, score, _)| (id.as_str(), score)));

    // Track last session id (used for future per-session state if needed)
    {
        let current_sid = session.as_ref().map(|(id, _, _)| id.clone());
        let mut t = tracker.lock().unwrap();
        if t.last_session_id != current_sid {
            t.last_session_id = current_sid;
        }
    }

    // Award time-based combo bonuses (once per session per milestone)
    if let Some((ref session_id, _, ref started_at)) = session {
        let start_time = chrono::DateTime::parse_from_rfc3339(started_at)
            .map(|t| t.with_timezone(&Utc))
            .unwrap_or(now);
        let paused_ms: i64 = conn.query_row(
            "SELECT paused_ms FROM sessions WHERE id=?1",
            rusqlite::params![session_id],
            |r| r.get(0),
        ).unwrap_or(0);
        let elapsed_mins = (((now - start_time).num_milliseconds() - paused_ms) / 60_000).max(0);

        let milestones: &[(i64, i32, &str, &str)] = &[
            (30,  5,  "session_combo_30",  "30 min focus streak! +5"),
            (60,  10, "session_combo_60",  "60 min deep work combo! 🔥 +10"),
            (90,  15, "session_combo_90",  "90 min beast mode! 🔥 +15"),
            (120, 20, "session_combo_120", "2 hour legend run! 🔥 +20"),
        ];

        for &(threshold, delta, reason, explanation) in milestones {
            if elapsed_mins >= threshold {
                let already: i32 = conn.query_row(
                    "SELECT COUNT(*) FROM score_events WHERE session_id=?1 AND reason_code=?2",
                    rusqlite::params![session_id, reason],
                    |r| r.get(0),
                ).unwrap_or(1);
                if already == 0 {
                    emit_score(&conn, &now_str, Some(session_id), delta, reason, explanation, related_id);
                    update_session_score(&conn, session_id, delta);
                }
            }
        }
    }

    let (category, ppm) = match &rule {
        Some((cat, ppm)) => (cat.as_str(), *ppm),
        None => ("neutral", 0),
    };

    // Base session minute: +1 for every non-idle tick while a session is active,
    // regardless of which app is in focus (as long as it's not a negative/penalty app).
    if let Some((ref session_id, _, _)) = session {
        if category != "negative" {
            emit_score(&conn, &now_str, Some(session_id), 1,
                "session_minute",
                "session minute +1",
                related_id);
            update_session_score(&conn, session_id, 1);
        }
    }

    match (category, &session) {
        ("positive", Some((session_id, _, _))) if ppm > 0 => {
            // Award bonus productive minute points on top of the base session_minute
            let delta = ppm;
            emit_score(&conn, &now_str, Some(session_id), delta,
                "productive_minute",
                &format!("Productive minute in {} (+{})", app_name, delta),
                related_id);
            update_session_score(&conn, session_id, delta);

        }
        ("negative", Some((session_id, _, _))) => {
            // In-session penalty for negative apps (sites handled by browser extension)
            emit_score(&conn, &now_str, Some(session_id), -3,
                "red_site_penalty",
                &format!("{} during session (-3)", app_name),
                related_id);
            update_session_score(&conn, session_id, -3);
        }
        ("negative", None) => {
            // Ambient penalty (outside session)
            emit_score(&conn, &now_str, None, -1,
                "ambient_red_site_penalty",
                &format!("{} outside session (-1)", app_name),
                related_id);
        }
        _ => {}
    }
}

fn emit_score(
    conn: &Connection,
    ts: &str,
    session_id: Option<&str>,
    delta: i32,
    reason_code: &str,
    explanation: &str,
    related_event_id: Option<&str>,
) {
    let id = Uuid::new_v4().to_string();
    if let Err(e) = conn.execute(
        "INSERT INTO score_events (id, ts, session_id, delta, reason_code, explanation, related_event_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![id, ts, session_id, delta, reason_code, explanation, related_event_id],
    ) {
        eprintln!("[tracker] ERROR emitting score event ({}): {}", reason_code, e);
    }
}

fn update_session_score(conn: &Connection, session_id: &str, delta: i32) {
    if let Err(e) = conn.execute(
        "UPDATE sessions SET score_total = score_total + ?1 WHERE id = ?2",
        rusqlite::params![delta, session_id],
    ) {
        eprintln!("[tracker] ERROR updating session score: {}", e);
    } else {
        eprintln!("[tracker] session_score += {} for session {}", delta, session_id);
    }
}
