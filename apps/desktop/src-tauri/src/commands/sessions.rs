use crate::models::Session;
use crate::AppState;
use tauri::State;
use uuid::Uuid;
use chrono::Utc;

fn row_to_session(row: &rusqlite::Row) -> rusqlite::Result<Session> {
    Ok(Session {
        id: row.get(0)?,
        started_at: row.get(1)?,
        ended_at: row.get(2)?,
        state: row.get(3)?,
        planned_minutes: row.get(4)?,
        title: row.get(5)?,
        score_total: row.get(6)?,
        created_at: row.get(7)?,
    })
}

const SESSION_SELECT: &str =
    "SELECT id, started_at, ended_at, state, planned_minutes, title, score_total, created_at FROM sessions WHERE id=?1";

fn get_session(db: &rusqlite::Connection, id: &str) -> Result<Session, String> {
    db.query_row(SESSION_SELECT, rusqlite::params![id], row_to_session)
        .map_err(|e| format!("Session not found ({}): {}", id, e))
}

#[tauri::command]
pub fn session_start(
    state: State<AppState>,
    planned_minutes: Option<i32>,
    title: Option<String>,
) -> Result<Session, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();
    let id = Uuid::new_v4().to_string();

    db.execute(
        "UPDATE sessions SET state='ended', ended_at=?1 WHERE state='active'",
        rusqlite::params![now],
    ).map_err(|e| e.to_string())?;

    db.execute(
        "INSERT INTO sessions (id, started_at, ended_at, state, planned_minutes, title, score_total, created_at)
         VALUES (?1, ?2, NULL, 'active', ?3, ?4, 0, ?5)",
        rusqlite::params![id, now, planned_minutes, title, now],
    ).map_err(|e| e.to_string())?;

    // Award +5 for session start
    let score_id = Uuid::new_v4().to_string();
    db.execute(
        "INSERT INTO score_events (id, ts, session_id, delta, reason_code, explanation, related_event_id)
         VALUES (?1, ?2, ?3, 5, 'session_started', 'Session started — ready to work!', NULL)",
        rusqlite::params![score_id, now, id],
    ).map_err(|e| e.to_string())?;

    db.execute(
        "UPDATE sessions SET score_total = score_total + 5 WHERE id = ?1",
        rusqlite::params![id],
    ).map_err(|e| e.to_string())?;

    get_session(&db, &id)
}

#[tauri::command]
pub fn session_pause(state: State<AppState>, session_id: String) -> Result<Session, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute(
        "UPDATE sessions SET state='paused' WHERE id=?1 AND state='active'",
        rusqlite::params![session_id],
    ).map_err(|e| e.to_string())?;
    get_session(&db, &session_id)
}

#[tauri::command]
pub fn session_resume(state: State<AppState>, session_id: String) -> Result<Session, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute(
        "UPDATE sessions SET state='active' WHERE id=?1 AND state='paused'",
        rusqlite::params![session_id],
    ).map_err(|e| e.to_string())?;
    get_session(&db, &session_id)
}

#[tauri::command]
pub fn session_stop(state: State<AppState>, session_id: String) -> Result<Session, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();
    db.execute(
        "UPDATE sessions SET state='ended', ended_at=?1 WHERE id=?2 AND state IN ('active','paused')",
        rusqlite::params![now, session_id],
    ).map_err(|e| e.to_string())?;
    get_session(&db, &session_id)
}

#[tauri::command]
pub fn session_get_current(state: State<AppState>) -> Result<Option<Session>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let result = db.query_row(
        "SELECT id, started_at, ended_at, state, planned_minutes, title, score_total, created_at
         FROM sessions WHERE state IN ('active','paused') ORDER BY started_at DESC LIMIT 1",
        [],
        row_to_session,
    );
    match result {
        Ok(s) => Ok(Some(s)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn session_list_for_day(state: State<AppState>, date: String) -> Result<Vec<Session>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db.prepare(
        "SELECT id, started_at, ended_at, state, planned_minutes, title, score_total, created_at
         FROM sessions WHERE date(started_at) = ?1 ORDER BY started_at DESC"
    ).map_err(|e| e.to_string())?;
    let result = stmt.query_map(rusqlite::params![date], row_to_session)
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string());
    result
}
