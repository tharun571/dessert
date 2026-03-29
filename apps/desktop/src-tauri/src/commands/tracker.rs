use crate::AppState;
use serde::Serialize;
use tauri::State;

#[derive(Debug, Serialize)]
pub struct TrackerStatus {
    pub bundle_id: Option<String>,
    pub app_name: Option<String>,
    pub idle_seconds: f64,
    pub is_idle: bool,
    pub last_tick: Option<String>,
}

#[tauri::command]
pub fn tracker_get_status(state: State<AppState>) -> Result<TrackerStatus, String> {
    let t = state.tracker.lock().map_err(|e| e.to_string())?;
    Ok(TrackerStatus {
        bundle_id: t.bundle_id.clone(),
        app_name: t.app_name.clone(),
        idle_seconds: t.idle_seconds,
        is_idle: t.is_idle,
        last_tick: t.last_tick.clone(),
    })
}
