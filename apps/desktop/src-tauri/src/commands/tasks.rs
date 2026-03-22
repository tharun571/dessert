use crate::models::{Task, CreateTaskInput, UpdateTaskInput};
use crate::AppState;
use tauri::State;
use uuid::Uuid;
use chrono::Utc;

fn row_to_task(row: &rusqlite::Row) -> rusqlite::Result<Task> {
    Ok(Task {
        id: row.get(0)?,
        title: row.get(1)?,
        planned_for: row.get(2)?,
        estimated_minutes: row.get(3)?,
        is_main_quest: row.get::<_, i32>(4)? != 0,
        status: row.get(5)?,
        completed_at: row.get(6)?,
        completion_source: row.get(7)?,
        llm_verdict_json: row.get(8)?,
        notes: row.get(9)?,
        created_at: row.get(10)?,
    })
}

const TASK_SELECT: &str =
    "SELECT id, title, planned_for, estimated_minutes, is_main_quest, status, completed_at, completion_source, llm_verdict_json, notes, created_at FROM tasks WHERE id=?1";

fn get_task(db: &rusqlite::Connection, id: &str) -> Result<Task, String> {
    db.query_row(TASK_SELECT, rusqlite::params![id], row_to_task)
        .map_err(|e| e.to_string())
}

fn current_session_id(db: &rusqlite::Connection) -> Option<String> {
    db.query_row(
        "SELECT id FROM sessions WHERE state IN ('active','paused') ORDER BY started_at DESC LIMIT 1",
        [],
        |r| r.get(0),
    ).ok()
}

#[tauri::command]
pub fn task_create(state: State<AppState>, input: CreateTaskInput) -> Result<Task, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();
    let id = Uuid::new_v4().to_string();
    let is_main_quest = input.is_main_quest.unwrap_or(false) as i32;

    db.execute(
        "INSERT INTO tasks (id, title, planned_for, estimated_minutes, is_main_quest, status, completed_at, completion_source, notes, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 'planned', NULL, 'manual', ?6, ?7)",
        rusqlite::params![id, input.title, input.planned_for, input.estimated_minutes, is_main_quest, input.notes, now],
    ).map_err(|e| e.to_string())?;

    get_task(&db, &id)
}

#[tauri::command]
pub fn task_update(state: State<AppState>, input: UpdateTaskInput) -> Result<Task, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;

    if let Some(title) = &input.title {
        db.execute("UPDATE tasks SET title=?1 WHERE id=?2", rusqlite::params![title, input.id])
            .map_err(|e| e.to_string())?;
    }
    if let Some(em) = input.estimated_minutes {
        db.execute("UPDATE tasks SET estimated_minutes=?1 WHERE id=?2", rusqlite::params![em, input.id])
            .map_err(|e| e.to_string())?;
    }
    if let Some(mq) = input.is_main_quest {
        db.execute("UPDATE tasks SET is_main_quest=?1 WHERE id=?2", rusqlite::params![mq as i32, input.id])
            .map_err(|e| e.to_string())?;
    }
    if let Some(notes) = &input.notes {
        db.execute("UPDATE tasks SET notes=?1 WHERE id=?2", rusqlite::params![notes, input.id])
            .map_err(|e| e.to_string())?;
    }
    if let Some(pf) = &input.planned_for {
        db.execute("UPDATE tasks SET planned_for=?1 WHERE id=?2", rusqlite::params![pf, input.id])
            .map_err(|e| e.to_string())?;
    }

    get_task(&db, &input.id)
}

#[tauri::command]
pub fn task_mark_done(state: State<AppState>, task_id: String) -> Result<Task, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();

    let (is_main_quest, current_status): (i32, String) = db.query_row(
        "SELECT is_main_quest, status FROM tasks WHERE id=?1",
        rusqlite::params![task_id],
        |r| Ok((r.get(0)?, r.get(1)?)),
    ).map_err(|e| e.to_string())?;

    // Idempotent: if already done, don't award points again
    if current_status == "done" {
        return get_task(&db, &task_id);
    }

    db.execute(
        "UPDATE tasks SET status='done', completed_at=?1, completion_source='manual' WHERE id=?2",
        rusqlite::params![now, task_id],
    ).map_err(|e| e.to_string())?;

    let (delta, reason_code, explanation): (i32, &str, &str) = if is_main_quest != 0 {
        (25, "main_quest_completed", "Main Quest completed! Outstanding.")
    } else {
        (15, "task_completed", "Task completed — nice work.")
    };

    let score_id = Uuid::new_v4().to_string();
    let session_id: Option<String> = current_session_id(&db);

    db.execute(
        "INSERT INTO score_events (id, ts, session_id, delta, reason_code, explanation, related_event_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL)",
        rusqlite::params![score_id, now, session_id, delta, reason_code, explanation],
    ).map_err(|e| e.to_string())?;

    if let Some(ref sid) = session_id {
        db.execute(
            "UPDATE sessions SET score_total = score_total + ?1 WHERE id = ?2",
            rusqlite::params![delta, sid],
        ).map_err(|e| e.to_string())?;
    }

    get_task(&db, &task_id)
}

#[tauri::command]
pub fn task_reopen(state: State<AppState>, task_id: String) -> Result<Task, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;

    let (is_main_quest, current_status): (i32, String) = db.query_row(
        "SELECT is_main_quest, status FROM tasks WHERE id=?1",
        rusqlite::params![task_id],
        |r| Ok((r.get(0)?, r.get(1)?)),
    ).map_err(|e| e.to_string())?;

    // Only deduct points if actually was done
    if current_status == "done" {
        let delta = if is_main_quest != 0 { -25i32 } else { -15i32 };
        let now = Utc::now().to_rfc3339();
        let score_id = Uuid::new_v4().to_string();
        let session_id: Option<String> = current_session_id(&db);

        db.execute(
            "INSERT INTO score_events (id, ts, session_id, delta, reason_code, explanation, related_event_id)
             VALUES (?1, ?2, ?3, ?4, 'task_reopened', 'Task reopened — points reversed.', NULL)",
            rusqlite::params![score_id, now, session_id, delta],
        ).map_err(|e| e.to_string())?;

        if let Some(ref sid) = session_id {
            db.execute(
                "UPDATE sessions SET score_total = score_total + ?1 WHERE id = ?2",
                rusqlite::params![delta, sid],
            ).map_err(|e| e.to_string())?;
        }
    }

    db.execute(
        "UPDATE tasks SET status='planned', completed_at=NULL WHERE id=?1",
        rusqlite::params![task_id],
    ).map_err(|e| e.to_string())?;

    get_task(&db, &task_id)
}

#[tauri::command]
pub fn task_delete(state: State<AppState>, task_id: String) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute("DELETE FROM tasks WHERE id=?1", rusqlite::params![task_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn task_list_for_date(state: State<AppState>, date: String) -> Result<Vec<Task>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    // Include tasks planned for this date AND any overdue planned tasks from prior days (carryover)
    let mut stmt = db.prepare(
        "SELECT id, title, planned_for, estimated_minutes, is_main_quest, status, completed_at, completion_source, llm_verdict_json, notes, created_at
         FROM tasks
         WHERE planned_for=?1 OR (planned_for < ?1 AND status='planned')
         ORDER BY is_main_quest DESC, planned_for ASC, created_at ASC"
    ).map_err(|e| e.to_string())?;
    let result = stmt.query_map(rusqlite::params![date], row_to_task)
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string());
    result
}
