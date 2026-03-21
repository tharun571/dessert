use crate::models::{Reward, InventoryItem, CreateRewardInput, UpdateRewardInput};
use crate::AppState;
use tauri::State;
use uuid::Uuid;
use chrono::Utc;

fn row_to_reward(row: &rusqlite::Row) -> rusqlite::Result<Reward> {
    Ok(Reward {
        id: row.get(0)?,
        name: row.get(1)?,
        cost: row.get(2)?,
        duration_minutes: row.get(3)?,
        ends_session_on_consume: row.get::<_, i32>(4)? != 0,
        suppresses_scope: row.get(5)?,
        cooldown_minutes: row.get(6)?,
        enabled: row.get::<_, i32>(7)? != 0,
        created_at: row.get(8)?,
    })
}

fn row_to_inventory(row: &rusqlite::Row) -> rusqlite::Result<InventoryItem> {
    Ok(InventoryItem {
        id: row.get(0)?,
        reward_id: row.get(1)?,
        reward_name: row.get(2)?,
        reward_cost: row.get(3)?,
        purchased_at: row.get(4)?,
        consumed_at: row.get(5)?,
        status: row.get(6)?,
        purchase_session_id: row.get(7)?,
        consume_session_id: row.get(8)?,
    })
}

const REWARD_SELECT: &str =
    "SELECT id, name, cost, duration_minutes, ends_session_on_consume, suppresses_scope, cooldown_minutes, enabled, created_at FROM rewards WHERE id=?1";

const INVENTORY_SELECT: &str =
    "SELECT i.id, i.reward_id, r.name, r.cost, i.purchased_at, i.consumed_at, i.status, i.purchase_session_id, i.consume_session_id
     FROM inventory_items i JOIN rewards r ON r.id=i.reward_id WHERE i.id=?1";

fn get_reward(db: &rusqlite::Connection, id: &str) -> Result<Reward, String> {
    db.query_row(REWARD_SELECT, rusqlite::params![id], row_to_reward)
        .map_err(|e| e.to_string())
}

fn get_inventory_item(db: &rusqlite::Connection, id: &str) -> Result<InventoryItem, String> {
    db.query_row(INVENTORY_SELECT, rusqlite::params![id], row_to_inventory)
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
pub fn reward_list(state: State<AppState>) -> Result<Vec<Reward>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db.prepare(
        "SELECT id, name, cost, duration_minutes, ends_session_on_consume, suppresses_scope, cooldown_minutes, enabled, created_at
         FROM rewards WHERE enabled=1 ORDER BY cost ASC"
    ).map_err(|e| e.to_string())?;
    let result = stmt.query_map([], row_to_reward)
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string());
    result
}

#[tauri::command]
pub fn reward_list_all(state: State<AppState>) -> Result<Vec<Reward>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db.prepare(
        "SELECT id, name, cost, duration_minutes, ends_session_on_consume, suppresses_scope, cooldown_minutes, enabled, created_at
         FROM rewards ORDER BY cost ASC"
    ).map_err(|e| e.to_string())?;
    let result = stmt.query_map([], row_to_reward)
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string());
    result
}

#[tauri::command]
pub fn reward_create(state: State<AppState>, input: CreateRewardInput) -> Result<Reward, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();
    let id = Uuid::new_v4().to_string();
    let ends_session = input.ends_session_on_consume.unwrap_or(true) as i32;
    let scope = input.suppresses_scope.as_deref().unwrap_or("none").to_string();

    db.execute(
        "INSERT INTO rewards (id, name, cost, duration_minutes, ends_session_on_consume, suppresses_scope, cooldown_minutes, enabled, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1, ?8)",
        rusqlite::params![id, input.name, input.cost, input.duration_minutes, ends_session, scope, input.cooldown_minutes, now],
    ).map_err(|e| e.to_string())?;

    get_reward(&db, &id)
}

#[tauri::command]
pub fn reward_update(state: State<AppState>, input: UpdateRewardInput) -> Result<Reward, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;

    if let Some(name) = &input.name {
        db.execute("UPDATE rewards SET name=?1 WHERE id=?2", rusqlite::params![name, input.id])
            .map_err(|e| e.to_string())?;
    }
    if let Some(cost) = input.cost {
        db.execute("UPDATE rewards SET cost=?1 WHERE id=?2", rusqlite::params![cost, input.id])
            .map_err(|e| e.to_string())?;
    }
    if let Some(dm) = input.duration_minutes {
        db.execute("UPDATE rewards SET duration_minutes=?1 WHERE id=?2", rusqlite::params![dm, input.id])
            .map_err(|e| e.to_string())?;
    }
    if let Some(ends) = input.ends_session_on_consume {
        db.execute("UPDATE rewards SET ends_session_on_consume=?1 WHERE id=?2", rusqlite::params![ends as i32, input.id])
            .map_err(|e| e.to_string())?;
    }
    if let Some(scope) = &input.suppresses_scope {
        db.execute("UPDATE rewards SET suppresses_scope=?1 WHERE id=?2", rusqlite::params![scope, input.id])
            .map_err(|e| e.to_string())?;
    }
    if let Some(cm) = input.cooldown_minutes {
        db.execute("UPDATE rewards SET cooldown_minutes=?1 WHERE id=?2", rusqlite::params![cm, input.id])
            .map_err(|e| e.to_string())?;
    }
    if let Some(enabled) = input.enabled {
        db.execute("UPDATE rewards SET enabled=?1 WHERE id=?2", rusqlite::params![enabled as i32, input.id])
            .map_err(|e| e.to_string())?;
    }

    get_reward(&db, &input.id)
}

#[tauri::command]
pub fn reward_delete(state: State<AppState>, reward_id: String) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute("UPDATE rewards SET enabled=0 WHERE id=?1", rusqlite::params![reward_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn reward_purchase(
    state: State<AppState>,
    reward_id: String,
    purchase_session_id: Option<String>,
) -> Result<InventoryItem, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();

    let (cost, name): (i32, String) = db.query_row(
        "SELECT cost, name FROM rewards WHERE id=?1 AND enabled=1",
        rusqlite::params![reward_id],
        |r| Ok((r.get(0)?, r.get(1)?)),
    ).map_err(|e| format!("Reward not found: {}", e))?;

    let item_id = Uuid::new_v4().to_string();
    db.execute(
        "INSERT INTO inventory_items (id, reward_id, purchased_at, consumed_at, status, purchase_session_id, consume_session_id)
         VALUES (?1, ?2, ?3, NULL, 'available', ?4, NULL)",
        rusqlite::params![item_id, reward_id, now, purchase_session_id],
    ).map_err(|e| e.to_string())?;

    let score_id = Uuid::new_v4().to_string();
    let session_id: Option<String> = current_session_id(&db);

    db.execute(
        "INSERT INTO score_events (id, ts, session_id, delta, reason_code, explanation, related_event_id)
         VALUES (?1, ?2, ?3, ?4, 'reward_purchased', ?5, NULL)",
        rusqlite::params![score_id, now, session_id, -cost, format!("Bought: {} (-{} pts)", name, cost)],
    ).map_err(|e| e.to_string())?;

    if let Some(ref sid) = session_id {
        db.execute(
            "UPDATE sessions SET score_total = score_total - ?1 WHERE id = ?2",
            rusqlite::params![cost, sid],
        ).map_err(|e| e.to_string())?;
    }

    get_inventory_item(&db, &item_id)
}

#[tauri::command]
pub fn inventory_list_available(state: State<AppState>) -> Result<Vec<InventoryItem>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db.prepare(
        "SELECT i.id, i.reward_id, r.name, r.cost, i.purchased_at, i.consumed_at, i.status, i.purchase_session_id, i.consume_session_id
         FROM inventory_items i JOIN rewards r ON r.id=i.reward_id
         WHERE i.status='available' ORDER BY i.purchased_at DESC"
    ).map_err(|e| e.to_string())?;
    let result = stmt.query_map([], row_to_inventory)
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string());
    result
}

#[tauri::command]
pub fn inventory_consume(
    state: State<AppState>,
    item_id: String,
    consume_session_id: Option<String>,
) -> Result<InventoryItem, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();

    let (_reward_id, ends_session, suppresses_scope, duration_minutes): (String, i32, Option<String>, Option<i32>) = db.query_row(
        "SELECT r.id, r.ends_session_on_consume, r.suppresses_scope, r.duration_minutes
         FROM inventory_items i JOIN rewards r ON r.id=i.reward_id WHERE i.id=?1",
        rusqlite::params![item_id],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
    ).map_err(|e| format!("Item not found: {}", e))?;

    db.execute(
        "UPDATE inventory_items SET status='consumed', consumed_at=?1, consume_session_id=?2 WHERE id=?3",
        rusqlite::params![now, consume_session_id, item_id],
    ).map_err(|e| e.to_string())?;

    if let Some(ref scope) = suppresses_scope {
        if scope != "none" {
            if let Some(duration) = duration_minutes {
                let ends_at = chrono::Utc::now()
                    .checked_add_signed(chrono::Duration::minutes(duration as i64))
                    .unwrap()
                    .to_rfc3339();
                let effect_id = Uuid::new_v4().to_string();
                db.execute(
                    "INSERT INTO active_effects (id, inventory_item_id, effect_type, scope, started_at, ends_at, consumed)
                     VALUES (?1, ?2, 'site_penalty_suppression', ?3, ?4, ?5, 0)",
                    rusqlite::params![effect_id, item_id, scope, now, ends_at],
                ).map_err(|e| e.to_string())?;
            }
        }
    }

    if ends_session != 0 {
        db.execute(
            "UPDATE sessions SET state='ended', ended_at=?1 WHERE state IN ('active','paused')",
            rusqlite::params![now],
        ).map_err(|e| e.to_string())?;
    }

    get_inventory_item(&db, &item_id)
}
