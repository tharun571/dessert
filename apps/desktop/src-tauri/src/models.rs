use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DayPlanningStatus {
    pub local_date: String,
    pub has_tasks: bool,
    pub task_count: i32,
    pub has_sessions: bool,
    pub session_count: i32,
    pub needs_planning: bool,
    pub suggest_tomorrow: bool,
    /// true if it's morning (hour < 12), first session of the day, and sunlight not yet logged
    pub ask_sunlight: bool,
    /// true if sunlight was already logged today
    pub sunlight_done: bool,
    /// true if it's evening (hour >= 18), first evening session, and gym not yet logged
    pub ask_gym: bool,
    /// true if gym was already logged today
    pub gym_done: bool,
    pub book_done: bool,
    pub walk_done: bool,
    pub no_outside_food_done: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub id: String,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub state: String,
    pub planned_minutes: Option<i32>,
    pub title: Option<String>,
    pub score_total: i32,
    pub created_at: String,
    pub paused_ms: i64,
    pub paused_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub title: String,
    pub planned_for: String,
    pub estimated_minutes: Option<i32>,
    pub is_main_quest: bool,
    pub status: String,
    pub completed_at: Option<String>,
    pub completion_source: String,
    pub llm_verdict_json: Option<String>,
    pub notes: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Reward {
    pub id: String,
    pub name: String,
    pub cost: i32,
    pub duration_minutes: Option<i32>,
    pub ends_session_on_consume: bool,
    pub suppresses_scope: Option<String>,
    pub cooldown_minutes: Option<i32>,
    pub enabled: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InventoryItem {
    pub id: String,
    pub reward_id: String,
    pub reward_name: String,
    pub reward_cost: i32,
    pub purchased_at: String,
    pub consumed_at: Option<String>,
    pub status: String,
    pub purchase_session_id: Option<String>,
    pub consume_session_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppRule {
    pub id: String,
    pub matcher_type: String,
    pub matcher_value: String,
    pub label: String,
    pub category: String,
    pub points_per_minute: i32,
    pub enabled: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SiteRule {
    pub id: String,
    pub domain: String,
    pub label: String,
    pub category: String,
    pub grace_seconds: i32,
    pub penalty_per_minute_session: i32,
    pub penalty_per_minute_ambient: i32,
    pub reward_break_supported: bool,
    pub enabled: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScoreEvent {
    pub id: String,
    pub ts: String,
    pub session_id: Option<String>,
    pub delta: i32,
    pub reason_code: String,
    pub explanation: String,
    pub related_event_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DayScore {
    pub total: i32,
    pub earned: i32,
    pub lost: i32,
    pub spent: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OverallScore {
    pub total: i32,
    pub days: i32,
    pub earned: i32,
    pub lost: i32,
    pub spent: i32,
    pub sessions_completed: i32,
    pub tasks_completed: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionEndStats {
    pub duration_ms: i64,
    pub is_longest_today: bool,
    pub is_longest_week: bool,
    pub is_longest_ever: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AllRules {
    pub app_rules: Vec<AppRule>,
    pub site_rules: Vec<SiteRule>,
}

// --- Input types for commands ---

#[derive(Debug, Deserialize)]
pub struct CreateTaskInput {
    pub title: String,
    pub planned_for: String,
    pub estimated_minutes: Option<i32>,
    pub is_main_quest: Option<bool>,
    pub notes: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateTaskInput {
    pub id: String,
    pub title: Option<String>,
    pub estimated_minutes: Option<i32>,
    pub is_main_quest: Option<bool>,
    pub notes: Option<String>,
    pub planned_for: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateRewardInput {
    pub name: String,
    pub cost: i32,
    pub duration_minutes: Option<i32>,
    pub ends_session_on_consume: Option<bool>,
    pub suppresses_scope: Option<String>,
    pub cooldown_minutes: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateRewardInput {
    pub id: String,
    pub name: Option<String>,
    pub cost: Option<i32>,
    pub duration_minutes: Option<i32>,
    pub ends_session_on_consume: Option<bool>,
    pub suppresses_scope: Option<String>,
    pub cooldown_minutes: Option<i32>,
    pub enabled: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct UpsertAppRuleInput {
    pub id: Option<String>,
    pub matcher_type: String,
    pub matcher_value: String,
    pub label: String,
    pub category: String,
    pub points_per_minute: i32,
    pub enabled: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct UpsertSiteRuleInput {
    pub id: Option<String>,
    pub domain: String,
    pub label: String,
    pub category: String,
    pub grace_seconds: Option<i32>,
    pub penalty_per_minute_session: Option<i32>,
    pub penalty_per_minute_ambient: Option<i32>,
    pub reward_break_supported: Option<bool>,
    pub enabled: Option<bool>,
}
