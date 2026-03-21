mod db;
mod models;
mod seeds;
mod tracker;
mod browser_bridge;
mod commands;

use std::sync::{Arc, Mutex};
use tauri::Manager;

pub struct AppState {
    pub db: Arc<Mutex<rusqlite::Connection>>,
    pub tracker: Arc<Mutex<tracker::TrackerState>>,
    pub bridge: Arc<Mutex<browser_bridge::BridgeState>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()
                .expect("failed to get app data dir");
            std::fs::create_dir_all(&data_dir).expect("failed to create app data dir");
            let db_path = data_dir.join("dessert.sqlite");
            let conn = db::open(db_path).expect("failed to open DB");
            seeds::seed_if_empty(&conn).expect("failed to seed DB");

            let db = Arc::new(Mutex::new(conn));
            let tracker_state = Arc::new(Mutex::new(tracker::TrackerState::default()));
            let bridge_state = Arc::new(Mutex::new(browser_bridge::BridgeState::new()));

            // Start macOS background tracker
            tracker::start(Arc::clone(&db), Arc::clone(&tracker_state));

            // Start localhost HTTP bridge for Arc extension
            browser_bridge::start(Arc::clone(&db), Arc::clone(&bridge_state));

            app.manage(AppState {
                db,
                tracker: tracker_state,
                bridge: bridge_state,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::sessions::session_start,
            commands::sessions::session_pause,
            commands::sessions::session_resume,
            commands::sessions::session_stop,
            commands::sessions::session_get_current,
            commands::sessions::session_list_for_day,
            commands::tasks::task_create,
            commands::tasks::task_update,
            commands::tasks::task_mark_done,
            commands::tasks::task_reopen,
            commands::tasks::task_delete,
            commands::tasks::task_list_for_date,
            commands::rewards::reward_list,
            commands::rewards::reward_list_all,
            commands::rewards::reward_create,
            commands::rewards::reward_update,
            commands::rewards::reward_delete,
            commands::rewards::reward_purchase,
            commands::rewards::inventory_list_available,
            commands::rewards::inventory_consume,
            commands::scoring::score_get_today,
            commands::scoring::timeline_get_for_day,
            commands::rules::rules_get_all,
            commands::rules::rules_upsert_app_rule,
            commands::rules::rules_upsert_site_rule,
            commands::tracker::tracker_get_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
