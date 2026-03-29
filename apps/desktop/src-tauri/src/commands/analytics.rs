use std::collections::HashSet;

use chrono::{Duration, NaiveDate, Timelike, Utc};
use serde_json::Value;
use tauri::State;

use crate::models::{
    ActivityDot, ActivitySegment, AnalyticsDashboard, AnalyticsDayPoint, AnalyticsTodaySummary,
    TodayActivity,
};
use crate::AppState;

fn minute_of_day(ts: &str) -> Option<i32> {
    let dt = chrono::DateTime::parse_from_rfc3339(ts)
        .ok()?
        .with_timezone(&Utc);
    Some((dt.hour() as i32) * 60 + (dt.minute() as i32))
}

fn day_metrics(db: &rusqlite::Connection, date: &str) -> Result<(i64, i32, i32, i32, i32), String> {
    let work_ms: i64 = db.query_row(
        "SELECT COALESCE(SUM(CAST((julianday(ended_at) - julianday(started_at)) * 86400000 AS INTEGER) - paused_ms), 0)
         FROM sessions
         WHERE date(started_at)=?1 AND state='ended' AND ended_at IS NOT NULL",
        rusqlite::params![date],
        |r| r.get(0),
    ).map_err(|e| e.to_string())?;

    let sessions_started: i32 = db
        .query_row(
            "SELECT COUNT(*) FROM sessions WHERE date(started_at)=?1",
            rusqlite::params![date],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;

    let points_earned: i32 = db
        .query_row(
            "SELECT COALESCE(SUM(delta), 0) FROM score_events WHERE date(ts)=?1 AND delta > 0",
            rusqlite::params![date],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;

    let points_spent: i32 = db
        .query_row(
            "SELECT COALESCE(SUM(ABS(delta)), 0)
             FROM score_events
             WHERE date(ts)=?1 AND reason_code='reward_purchased'",
            rusqlite::params![date],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;

    let quests_completed: i32 = db
        .query_row(
            "SELECT COUNT(*) FROM score_events
         WHERE date(ts)=?1 AND reason_code IN ('task_completed', 'main_quest_completed')",
            rusqlite::params![date],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;

    Ok((
        work_ms,
        sessions_started,
        points_earned,
        points_spent,
        quests_completed,
    ))
}

fn reason_to_dot_kind(reason_code: &str) -> &'static str {
    match reason_code {
        "reward_purchased" => "dessert_bought",
        "sunlight" | "gym" | "book" | "walk" | "no_outside_food" | "cold_shower" | "meditation"
        | "singing_practice" => "habit",
        "red_site_penalty" | "ambient_red_site_penalty" => "penalty",
        "session_started" | "session_combo_30" | "session_combo_60" | "session_combo_90"
        | "session_combo_120" | "session_combo_180" => "milestone",
        "task_completed" | "main_quest_completed" | "task_reopened" => "task",
        _ => "other",
    }
}

fn build_segments(buckets: &[Option<&'static str>]) -> Vec<ActivitySegment> {
    let mut segments = Vec::new();
    let mut i = 0usize;

    while i < buckets.len() {
        let Some(kind) = buckets[i] else {
            i += 1;
            continue;
        };
        let start = i;
        let mut end = i + 1;
        while end < buckets.len() && buckets[end] == Some(kind) {
            end += 1;
        }
        segments.push(ActivitySegment {
            kind: kind.to_string(),
            start_minute: start as i32,
            end_minute: end as i32,
        });
        i = end;
    }

    segments
}

#[tauri::command]
pub fn analytics_get_dashboard(
    state: State<AppState>,
    local_date: String,
    days: Option<i32>,
) -> Result<AnalyticsDashboard, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let days = days.unwrap_or(7).clamp(1, 30);

    let end_date = NaiveDate::parse_from_str(&local_date, "%Y-%m-%d")
        .unwrap_or_else(|_| Utc::now().date_naive());
    let start_date = end_date - Duration::days((days - 1) as i64);

    let mut daywise = Vec::new();
    for i in 0..days {
        let day = start_date + Duration::days(i as i64);
        let day_str = day.format("%Y-%m-%d").to_string();
        let (work_ms, sessions_started, points_earned, points_spent, quests_completed) =
            day_metrics(&db, &day_str)?;
        daywise.push(AnalyticsDayPoint {
            date: day_str,
            work_ms,
            sessions_started,
            points_earned,
            points_spent,
            quests_completed,
        });
    }

    let (
        today_work_ms,
        today_sessions_started,
        today_points_earned,
        _today_points_spent,
        today_quests_completed,
    ) = day_metrics(&db, &local_date)?;

    let mut buckets: Vec<Option<&'static str>> = vec![None; 1440];
    let mut idle_minutes: HashSet<i32> = HashSet::new();

    let mut raw_stmt = db
        .prepare(
            "SELECT ts, payload_json, session_id
         FROM raw_events
         WHERE event_type='frontmost_app' AND date(ts)=?1
         ORDER BY ts ASC",
        )
        .map_err(|e| e.to_string())?;

    let raw_rows = raw_stmt
        .query_map(rusqlite::params![local_date], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    for row in raw_rows {
        let (ts, payload_json, session_id) = row.map_err(|e| e.to_string())?;
        let Some(minute) = minute_of_day(&ts) else {
            continue;
        };
        if minute < 0 || minute >= 1440 || session_id.is_none() {
            continue;
        }
        let idx = minute as usize;
        let is_idle = serde_json::from_str::<Value>(&payload_json)
            .ok()
            .and_then(|v| v.get("is_idle").and_then(|x| x.as_bool()))
            .unwrap_or(false);

        if is_idle {
            buckets[idx] = Some("idle");
            idle_minutes.insert(minute);
        } else if buckets[idx].is_none() {
            buckets[idx] = Some("focus");
        }
    }

    let mut dots = Vec::new();

    let mut score_stmt = db
        .prepare(
            "SELECT ts, reason_code, explanation
         FROM score_events
         WHERE date(ts)=?1
         ORDER BY ts ASC",
        )
        .map_err(|e| e.to_string())?;

    let score_rows = score_stmt
        .query_map(rusqlite::params![local_date], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    for row in score_rows {
        let (ts, reason_code, explanation) = row.map_err(|e| e.to_string())?;
        let Some(minute) = minute_of_day(&ts) else {
            continue;
        };
        dots.push(ActivityDot {
            kind: reason_to_dot_kind(&reason_code).to_string(),
            minute,
            ts,
            label: explanation,
        });
    }

    let mut consume_stmt = db
        .prepare(
            "SELECT i.consumed_at, r.name
         FROM inventory_items i
         JOIN rewards r ON r.id = i.reward_id
         WHERE i.status='consumed' AND i.consumed_at IS NOT NULL AND date(i.consumed_at)=?1
         ORDER BY i.consumed_at ASC",
        )
        .map_err(|e| e.to_string())?;

    let consume_rows = consume_stmt
        .query_map(rusqlite::params![local_date], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| e.to_string())?;

    for row in consume_rows {
        let (ts, reward_name) = row.map_err(|e| e.to_string())?;
        let Some(minute) = minute_of_day(&ts) else {
            continue;
        };
        dots.push(ActivityDot {
            kind: "dessert_used".to_string(),
            minute,
            ts,
            label: format!("Used: {reward_name}"),
        });
    }

    dots.sort_by(|a, b| a.minute.cmp(&b.minute).then_with(|| a.ts.cmp(&b.ts)));

    let today_activity = TodayActivity {
        segments: build_segments(&buckets),
        dots,
    };

    let today_summary = AnalyticsTodaySummary {
        work_ms: today_work_ms,
        idle_ms: (idle_minutes.len() as i64) * 60_000,
        sessions_started: today_sessions_started,
        points_earned: today_points_earned,
        quests_completed: today_quests_completed,
    };

    Ok(AnalyticsDashboard {
        daywise,
        today_summary,
        today_activity,
    })
}
