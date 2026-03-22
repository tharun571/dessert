use crate::models::{Session, DayPlanningStatus, SessionEndStats};
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
        paused_ms: row.get(8)?,
        paused_at: row.get(9)?,
    })
}

const SESSION_SELECT: &str =
    "SELECT id, started_at, ended_at, state, planned_minutes, title, score_total, created_at, paused_ms, paused_at FROM sessions WHERE id=?1";

fn get_session(db: &rusqlite::Connection, id: &str) -> Result<Session, String> {
    db.query_row(SESSION_SELECT, rusqlite::params![id], row_to_session)
        .map_err(|e| format!("Session not found ({}): {}", id, e))
}

#[tauri::command]
pub fn session_start(
    state: State<AppState>,
    planned_minutes: Option<i32>,
    title: Option<String>,
    local_date: String,
) -> Result<Session, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;

    // Gate: require at least one task to exist for today before the first session
    let task_count: i32 = db.query_row(
        "SELECT COUNT(*) FROM tasks WHERE planned_for=?1 AND status IN ('planned','done')",
        rusqlite::params![local_date],
        |r| r.get(0),
    ).unwrap_or(0);

    let session_count: i32 = db.query_row(
        "SELECT COUNT(*) FROM sessions WHERE date(started_at)=?1",
        rusqlite::params![local_date],
        |r| r.get(0),
    ).unwrap_or(0);

    if task_count == 0 && session_count == 0 {
        return Err("plan your day first! add at least one quest before starting a session.".to_string());
    }

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

    // Award +5 for session start — only for the first 6 sessions of the day
    if session_count < 6 {
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
    }

    get_session(&db, &id)
}

#[tauri::command]
pub fn session_pause(state: State<AppState>, session_id: String) -> Result<Session, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();
    db.execute(
        "UPDATE sessions SET state='paused', paused_at=?1 WHERE id=?2 AND state='active'",
        rusqlite::params![now, session_id],
    ).map_err(|e| e.to_string())?;
    get_session(&db, &session_id)
}

#[tauri::command]
pub fn session_resume(state: State<AppState>, session_id: String) -> Result<Session, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let now = Utc::now();

    // Read when this pause started, accumulate into paused_ms
    let paused_at_str: Option<String> = db.query_row(
        "SELECT paused_at FROM sessions WHERE id=?1",
        rusqlite::params![session_id],
        |r| r.get(0),
    ).map_err(|e| e.to_string())?;

    if let Some(paused_at_str) = paused_at_str {
        let paused_at = chrono::DateTime::parse_from_rfc3339(&paused_at_str)
            .map_err(|e| e.to_string())?
            .with_timezone(&Utc);
        let added_ms = (now - paused_at).num_milliseconds().max(0);
        db.execute(
            "UPDATE sessions SET state='active', paused_ms = paused_ms + ?1, paused_at = NULL WHERE id=?2 AND state='paused'",
            rusqlite::params![added_ms, session_id],
        ).map_err(|e| e.to_string())?;
    } else {
        db.execute(
            "UPDATE sessions SET state='active', paused_at = NULL WHERE id=?1 AND state='paused'",
            rusqlite::params![session_id],
        ).map_err(|e| e.to_string())?;
    }

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
        "SELECT id, started_at, ended_at, state, planned_minutes, title, score_total, created_at, paused_ms, paused_at
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
        "SELECT id, started_at, ended_at, state, planned_minutes, title, score_total, created_at, paused_ms, paused_at
         FROM sessions WHERE date(started_at) = ?1 ORDER BY started_at DESC"
    ).map_err(|e| e.to_string())?;
    let result = stmt.query_map(rusqlite::params![date], row_to_session)
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string());
    result
}

#[tauri::command]
pub fn day_planning_status(
    state: State<AppState>,
    local_date: String,
    local_tomorrow_date: String,
    hour: i32,
) -> Result<DayPlanningStatus, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;

    let task_count: i32 = db.query_row(
        "SELECT COUNT(*) FROM tasks WHERE planned_for=?1 AND status IN ('planned','done')",
        rusqlite::params![local_date],
        |r| r.get(0),
    ).unwrap_or(0);

    let session_count: i32 = db.query_row(
        "SELECT COUNT(*) FROM sessions WHERE date(started_at)=?1",
        rusqlite::params![local_date],
        |r| r.get(0),
    ).unwrap_or(0);

    let tomorrow_task_count: i32 = db.query_row(
        "SELECT COUNT(*) FROM tasks WHERE planned_for=?1 AND status IN ('planned','done')",
        rusqlite::params![local_tomorrow_date],
        |r| r.get(0),
    ).unwrap_or(0);

    let sunlight_logged: i32 = db.query_row(
        "SELECT COUNT(*) FROM score_events WHERE reason_code='sunlight' AND date(ts)=?1",
        rusqlite::params![local_date],
        |r| r.get(0),
    ).unwrap_or(0);

    let gym_logged: i32 = db.query_row(
        "SELECT COUNT(*) FROM score_events WHERE reason_code='gym' AND date(ts)=?1",
        rusqlite::params![local_date],
        |r| r.get(0),
    ).unwrap_or(0);

    // Count sessions started at or after 6pm today
    let evening_session_count: i32 = db.query_row(
        "SELECT COUNT(*) FROM sessions WHERE date(started_at)=?1 AND strftime('%H', started_at) >= '18'",
        rusqlite::params![local_date],
        |r| r.get(0),
    ).unwrap_or(0);

    // Helper closure: get timestamp of a logged habit for today, if any
    let habit_ts = |code: &str| -> Option<String> {
        db.query_row(
            "SELECT ts FROM score_events WHERE reason_code=?1 AND date(ts)=?2 AND delta > 0 ORDER BY ts DESC LIMIT 1",
            rusqlite::params![code, local_date],
            |r| r.get(0),
        ).ok()
    };

    let sunlight_at = habit_ts("sunlight");
    let gym_at      = habit_ts("gym");
    let book_at     = habit_ts("book");
    let walk_at     = habit_ts("walk");
    let no_outside_food_at = habit_ts("no_outside_food");

    let book_logged             = book_at.is_some() as i32;
    let walk_logged             = walk_at.is_some() as i32;
    let no_outside_food_logged  = no_outside_food_at.is_some() as i32;

    Ok(DayPlanningStatus {
        local_date,
        has_tasks: task_count > 0,
        task_count,
        has_sessions: session_count > 0,
        session_count,
        needs_planning: task_count == 0 && session_count == 0,
        suggest_tomorrow: hour >= 17 && tomorrow_task_count == 0,
        ask_sunlight: hour < 12 && session_count == 0 && sunlight_logged == 0,
        sunlight_done: sunlight_logged > 0,
        sunlight_at,
        ask_gym: hour >= 18 && evening_session_count == 0 && gym_logged == 0,
        gym_done: gym_logged > 0,
        gym_at,
        book_done: book_logged > 0,
        book_at,
        walk_done: walk_logged > 0,
        walk_at,
        no_outside_food_done: no_outside_food_logged > 0,
        no_outside_food_at,
    })
}

#[tauri::command]
pub fn session_end_stats(state: State<AppState>, session_id: String) -> Result<SessionEndStats, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;

    // Get this session's data
    let (started_at, ended_at_opt, paused_ms): (String, Option<String>, i64) = db.query_row(
        "SELECT started_at, ended_at, paused_ms FROM sessions WHERE id=?1",
        rusqlite::params![session_id],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
    ).map_err(|e| e.to_string())?;

    let ended_at = ended_at_opt.unwrap_or_else(|| chrono::Utc::now().to_rfc3339());

    let start = chrono::DateTime::parse_from_rfc3339(&started_at).map_err(|e| e.to_string())?;
    let end = chrono::DateTime::parse_from_rfc3339(&ended_at).map_err(|e| e.to_string())?;
    let duration_ms = ((end - start).num_milliseconds() - paused_ms).max(0);

    let today_date = start.format("%Y-%m-%d").to_string();

    // Helper: compute active duration in ms for a session row (wall-clock minus paused_ms)
    // We use (julianday(ended_at) - julianday(started_at)) * 86400000 - paused_ms
    let duration_sql = "(CAST((julianday(ended_at) - julianday(started_at)) * 86400000 AS INTEGER) - paused_ms)";

    let longest_today: i64 = db.query_row(
        &format!("SELECT COALESCE(MAX({duration_sql}), 0) FROM sessions
                  WHERE state='ended' AND ended_at IS NOT NULL AND date(started_at)=?1"),
        rusqlite::params![today_date],
        |r| r.get(0),
    ).unwrap_or(0);

    let longest_week: i64 = db.query_row(
        &format!("SELECT COALESCE(MAX({duration_sql}), 0) FROM sessions
                  WHERE state='ended' AND ended_at IS NOT NULL
                    AND started_at >= date('now', 'weekday 1', '-7 days')"),
        [],
        |r| r.get(0),
    ).unwrap_or(0);

    let longest_ever: i64 = db.query_row(
        &format!("SELECT COALESCE(MAX({duration_sql}), 0) FROM sessions
                  WHERE state='ended' AND ended_at IS NOT NULL"),
        [],
        |r| r.get(0),
    ).unwrap_or(0);

    Ok(SessionEndStats {
        duration_ms,
        is_longest_today: duration_ms > 0 && duration_ms >= longest_today,
        is_longest_week: duration_ms > 0 && duration_ms >= longest_week,
        is_longest_ever: duration_ms > 0 && duration_ms >= longest_ever,
    })
}

#[tauri::command]
pub fn log_gym(state: State<AppState>, local_date: String) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();
    let id = uuid::Uuid::new_v4().to_string();

    let already: i32 = db.query_row(
        "SELECT COUNT(*) FROM score_events WHERE reason_code='gym' AND date(ts)=?1",
        rusqlite::params![local_date],
        |r| r.get(0),
    ).unwrap_or(0);

    if already > 0 {
        return Ok(());
    }

    db.execute(
        "INSERT INTO score_events (id, ts, session_id, delta, reason_code, explanation, related_event_id)
         VALUES (?1, ?2, NULL, 10, 'gym', 'hit the gym 💪', NULL)",
        rusqlite::params![id, now],
    ).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn unlog_habit(state: State<AppState>, reason_code: String, local_date: String) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    // Delete the positive score event logged today for this habit
    db.execute(
        "DELETE FROM score_events WHERE reason_code=?1 AND date(ts)=?2 AND delta > 0",
        rusqlite::params![reason_code, local_date],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn log_book(state: State<AppState>, local_date: String) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();
    let id = uuid::Uuid::new_v4().to_string();
    let already: i32 = db.query_row(
        "SELECT COUNT(*) FROM score_events WHERE reason_code='book' AND date(ts)=?1",
        rusqlite::params![local_date], |r| r.get(0),
    ).unwrap_or(0);
    if already > 0 { return Ok(()); }
    db.execute(
        "INSERT INTO score_events (id, ts, session_id, delta, reason_code, explanation, related_event_id)
         VALUES (?1, ?2, NULL, 10, 'book', 'read a book today 📚', NULL)",
        rusqlite::params![id, now],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn log_walk(state: State<AppState>, local_date: String) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();
    let id = uuid::Uuid::new_v4().to_string();
    let already: i32 = db.query_row(
        "SELECT COUNT(*) FROM score_events WHERE reason_code='walk' AND date(ts)=?1",
        rusqlite::params![local_date], |r| r.get(0),
    ).unwrap_or(0);
    if already > 0 { return Ok(()); }
    db.execute(
        "INSERT INTO score_events (id, ts, session_id, delta, reason_code, explanation, related_event_id)
         VALUES (?1, ?2, NULL, 10, 'walk', 'went for a walk 🚶', NULL)",
        rusqlite::params![id, now],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn log_no_outside_food(state: State<AppState>, local_date: String) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();
    let id = uuid::Uuid::new_v4().to_string();
    let already: i32 = db.query_row(
        "SELECT COUNT(*) FROM score_events WHERE reason_code='no_outside_food' AND date(ts)=?1",
        rusqlite::params![local_date], |r| r.get(0),
    ).unwrap_or(0);
    if already > 0 { return Ok(()); }
    db.execute(
        "INSERT INTO score_events (id, ts, session_id, delta, reason_code, explanation, related_event_id)
         VALUES (?1, ?2, NULL, 10, 'no_outside_food', 'no outside food today 🥗', NULL)",
        rusqlite::params![id, now],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn log_sunlight(state: State<AppState>, local_date: String) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();
    let id = uuid::Uuid::new_v4().to_string();

    // Idempotent: skip if already logged today
    let already: i32 = db.query_row(
        "SELECT COUNT(*) FROM score_events WHERE reason_code='sunlight' AND date(ts)=?1",
        rusqlite::params![local_date],
        |r| r.get(0),
    ).unwrap_or(0);

    if already > 0 {
        return Ok(());
    }

    db.execute(
        "INSERT INTO score_events (id, ts, session_id, delta, reason_code, explanation, related_event_id)
         VALUES (?1, ?2, NULL, 10, 'sunlight', 'got some sunlight this morning ☀️', NULL)",
        rusqlite::params![id, now],
    ).map_err(|e| e.to_string())?;

    Ok(())
}
