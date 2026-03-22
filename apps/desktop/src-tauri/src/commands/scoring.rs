use crate::models::{ScoreEvent, DayScore, OverallScore};
use crate::AppState;
use tauri::State;

fn row_to_score_event(row: &rusqlite::Row) -> rusqlite::Result<ScoreEvent> {
    Ok(ScoreEvent {
        id: row.get(0)?,
        ts: row.get(1)?,
        session_id: row.get(2)?,
        delta: row.get(3)?,
        reason_code: row.get(4)?,
        explanation: row.get(5)?,
        related_event_id: row.get(6)?,
    })
}

#[tauri::command]
pub fn score_get_today(state: State<AppState>) -> Result<DayScore, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let today = chrono::Utc::now().format("%Y-%m-%d").to_string();

    let total: i32 = db.query_row(
        "SELECT COALESCE(SUM(delta), 0) FROM score_events WHERE date(ts) = ?1",
        rusqlite::params![today],
        |r| r.get(0),
    ).map_err(|e| e.to_string())?;

    let earned: i32 = db.query_row(
        "SELECT COALESCE(SUM(delta), 0) FROM score_events WHERE date(ts) = ?1 AND delta > 0 AND reason_code != 'reward_purchased'",
        rusqlite::params![today],
        |r| r.get(0),
    ).map_err(|e| e.to_string())?;

    let lost: i32 = db.query_row(
        "SELECT COALESCE(SUM(ABS(delta)), 0) FROM score_events WHERE date(ts) = ?1 AND delta < 0 AND reason_code != 'reward_purchased'",
        rusqlite::params![today],
        |r| r.get(0),
    ).map_err(|e| e.to_string())?;

    let spent: i32 = db.query_row(
        "SELECT COALESCE(SUM(ABS(delta)), 0) FROM score_events WHERE date(ts) = ?1 AND reason_code = 'reward_purchased'",
        rusqlite::params![today],
        |r| r.get(0),
    ).map_err(|e| e.to_string())?;

    Ok(DayScore { total, earned, lost, spent })
}

#[tauri::command]
pub fn score_get_overall(state: State<AppState>) -> Result<OverallScore, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;

    let total: i32 = db.query_row(
        "SELECT COALESCE(SUM(delta), 0) FROM score_events",
        [],
        |r| r.get(0),
    ).map_err(|e| e.to_string())?;

    let days: i32 = db.query_row(
        "SELECT COUNT(DISTINCT date(ts)) FROM score_events",
        [],
        |r| r.get(0),
    ).map_err(|e| e.to_string())?;

    let earned: i32 = db.query_row(
        "SELECT COALESCE(SUM(delta), 0) FROM score_events WHERE delta > 0 AND reason_code != 'reward_purchased'",
        [],
        |r| r.get(0),
    ).map_err(|e| e.to_string())?;

    let lost: i32 = db.query_row(
        "SELECT COALESCE(SUM(ABS(delta)), 0) FROM score_events WHERE delta < 0 AND reason_code != 'reward_purchased'",
        [],
        |r| r.get(0),
    ).map_err(|e| e.to_string())?;

    let spent: i32 = db.query_row(
        "SELECT COALESCE(SUM(ABS(delta)), 0) FROM score_events WHERE reason_code = 'reward_purchased'",
        [],
        |r| r.get(0),
    ).map_err(|e| e.to_string())?;

    let sessions_completed: i32 = db.query_row(
        "SELECT COUNT(*) FROM sessions WHERE state = 'ended'",
        [],
        |r| r.get(0),
    ).map_err(|e| e.to_string())?;

    let tasks_completed: i32 = db.query_row(
        "SELECT COUNT(*) FROM score_events WHERE reason_code IN ('task_completed', 'main_quest_completed')",
        [],
        |r| r.get(0),
    ).map_err(|e| e.to_string())?;

    Ok(OverallScore { total, days, earned, lost, spent, sessions_completed, tasks_completed })
}

#[tauri::command]
pub fn timeline_get_for_day(state: State<AppState>, date: String) -> Result<Vec<ScoreEvent>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db.prepare(
        "SELECT id, ts, session_id, delta, reason_code, explanation, related_event_id
         FROM score_events WHERE date(ts) = ?1 ORDER BY ts DESC"
    ).map_err(|e| e.to_string())?;
    let result = stmt.query_map(rusqlite::params![date], row_to_score_event)
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string());
    result
}
