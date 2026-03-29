use crate::models::{AllRules, AppRule, SiteRule, UpsertAppRuleInput, UpsertSiteRuleInput};
use crate::AppState;
use chrono::Utc;
use tauri::State;
use uuid::Uuid;

fn row_to_app_rule(row: &rusqlite::Row) -> rusqlite::Result<AppRule> {
    Ok(AppRule {
        id: row.get(0)?,
        matcher_type: row.get(1)?,
        matcher_value: row.get(2)?,
        label: row.get(3)?,
        category: row.get(4)?,
        points_per_minute: row.get(5)?,
        enabled: row.get::<_, i32>(6)? != 0,
        created_at: row.get(7)?,
    })
}

fn row_to_site_rule(row: &rusqlite::Row) -> rusqlite::Result<SiteRule> {
    Ok(SiteRule {
        id: row.get(0)?,
        domain: row.get(1)?,
        label: row.get(2)?,
        category: row.get(3)?,
        grace_seconds: row.get(4)?,
        penalty_per_minute_session: row.get(5)?,
        penalty_per_minute_ambient: row.get(6)?,
        reward_break_supported: row.get::<_, i32>(7)? != 0,
        enabled: row.get::<_, i32>(8)? != 0,
        created_at: row.get(9)?,
    })
}

#[tauri::command]
pub fn rules_get_all(state: State<AppState>) -> Result<AllRules, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;

    let mut stmt = db.prepare(
        "SELECT id, matcher_type, matcher_value, label, category, points_per_minute, enabled, created_at FROM app_rules ORDER BY category, label"
    ).map_err(|e| e.to_string())?;
    let app_rules = stmt
        .query_map([], row_to_app_rule)
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())?;

    let mut stmt2 = db.prepare(
        "SELECT id, domain, label, category, grace_seconds, penalty_per_minute_session, penalty_per_minute_ambient, reward_break_supported, enabled, created_at FROM site_rules ORDER BY category, domain"
    ).map_err(|e| e.to_string())?;
    let site_rules = stmt2
        .query_map([], row_to_site_rule)
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())?;

    Ok(AllRules {
        app_rules,
        site_rules,
    })
}

#[tauri::command]
pub fn rules_upsert_app_rule(
    state: State<AppState>,
    input: UpsertAppRuleInput,
) -> Result<AppRule, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();
    let id = input
        .id
        .clone()
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    let enabled = input.enabled.unwrap_or(true) as i32;

    db.execute(
        "INSERT INTO app_rules (id, matcher_type, matcher_value, label, category, points_per_minute, enabled, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
         ON CONFLICT(id) DO UPDATE SET matcher_type=excluded.matcher_type, matcher_value=excluded.matcher_value,
         label=excluded.label, category=excluded.category, points_per_minute=excluded.points_per_minute, enabled=excluded.enabled",
        rusqlite::params![id, input.matcher_type, input.matcher_value, input.label, input.category, input.points_per_minute, enabled, now],
    ).map_err(|e| e.to_string())?;

    db.query_row(
        "SELECT id, matcher_type, matcher_value, label, category, points_per_minute, enabled, created_at FROM app_rules WHERE id=?1",
        rusqlite::params![id],
        row_to_app_rule,
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn rules_upsert_site_rule(
    state: State<AppState>,
    input: UpsertSiteRuleInput,
) -> Result<SiteRule, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();
    let id = input
        .id
        .clone()
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    let grace = input.grace_seconds.unwrap_or(300);
    let penalty_session = input.penalty_per_minute_session.unwrap_or(3);
    let penalty_ambient = input.penalty_per_minute_ambient.unwrap_or(1);
    let reward_break = input.reward_break_supported.unwrap_or(false) as i32;
    let enabled = input.enabled.unwrap_or(true) as i32;

    db.execute(
        "INSERT INTO site_rules (id, domain, label, category, grace_seconds, penalty_per_minute_session, penalty_per_minute_ambient, reward_break_supported, enabled, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
         ON CONFLICT(domain) DO UPDATE SET label=excluded.label, category=excluded.category,
         grace_seconds=excluded.grace_seconds, penalty_per_minute_session=excluded.penalty_per_minute_session,
         penalty_per_minute_ambient=excluded.penalty_per_minute_ambient, reward_break_supported=excluded.reward_break_supported,
         enabled=excluded.enabled",
        rusqlite::params![id, input.domain, input.label, input.category, grace, penalty_session, penalty_ambient, reward_break, enabled, now],
    ).map_err(|e| e.to_string())?;

    let domain = input.domain.clone();
    db.query_row(
        "SELECT id, domain, label, category, grace_seconds, penalty_per_minute_session, penalty_per_minute_ambient, reward_break_supported, enabled, created_at FROM site_rules WHERE domain=?1",
        rusqlite::params![domain],
        row_to_site_rule,
    ).map_err(|e| e.to_string())
}
