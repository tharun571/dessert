mod browser_bridge;
mod commands;
mod db;
mod models;
mod seeds;
mod tracker;

#[cfg(target_os = "macos")]
use chrono::{DateTime, Utc};
use std::sync::{Arc, Mutex};
#[cfg(target_os = "macos")]
use std::time::Duration;
#[cfg(target_os = "macos")]
use tauri::menu::{MenuBuilder, MenuItemBuilder};
#[cfg(target_os = "macos")]
use tauri::tray::{MouseButton, TrayIconBuilder, TrayIconEvent};
use tauri::Manager;

pub struct AppState {
    pub db: Arc<Mutex<rusqlite::Connection>>,
    pub tracker: Arc<Mutex<tracker::TrackerState>>,
    pub bridge: Arc<Mutex<browser_bridge::BridgeState>>,
}

#[cfg(target_os = "macos")]
const MENU_TIMER_TRAY_ID: &str = "menu_timer";
#[cfg(target_os = "macos")]
const MENU_TIMER_QUIT_ID: &str = "quit";

#[cfg(target_os = "macos")]
fn parse_rfc3339_utc(ts: &str) -> Option<DateTime<Utc>> {
    chrono::DateTime::parse_from_rfc3339(ts)
        .ok()
        .map(|dt| dt.with_timezone(&Utc))
}

#[cfg(target_os = "macos")]
fn format_elapsed_for_menu(elapsed_ms: i64, always_hours: bool) -> String {
    let total_seconds = (elapsed_ms / 1000).max(0);
    let hours = total_seconds / 3600;
    let minutes = (total_seconds % 3600) / 60;
    let seconds = total_seconds % 60;

    if always_hours || hours > 0 {
        format!("{hours:02}:{minutes:02}:{seconds:02}")
    } else {
        format!("{minutes:02}:{seconds:02}")
    }
}

#[cfg(target_os = "macos")]
fn compute_menu_timer_title(conn: &rusqlite::Connection, now: DateTime<Utc>) -> String {
    use rusqlite::OptionalExtension;

    let current = conn
        .query_row(
            "SELECT id, state, started_at, paused_ms, paused_at, planned_minutes
         FROM sessions
         WHERE state IN ('active','paused')
         ORDER BY started_at DESC
         LIMIT 1",
            [],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, i64>(3)?,
                    row.get::<_, Option<String>>(4)?,
                    row.get::<_, Option<i64>>(5)?,
                ))
            },
        )
        .optional();

    let Ok(current) = current else {
        return "00:00".to_string();
    };
    let Some((session_id, state, started_at, paused_ms, paused_at, planned_minutes)) = current
    else {
        return "00:00".to_string();
    };

    let Some(started_at) = parse_rfc3339_utc(&started_at) else {
        return "00:00".to_string();
    };

    let mut elapsed_ms = (now - started_at).num_milliseconds() - paused_ms.max(0);
    if state == "paused" {
        if let Some(paused_at) = paused_at.as_deref().and_then(parse_rfc3339_utc) {
            elapsed_ms -= (now - paused_at).num_milliseconds().max(0);
        }
        let elapsed_ms = elapsed_ms.max(0);
        if let Some(planned_minutes) = planned_minutes.filter(|m| *m > 0) {
            let planned_ms = planned_minutes * 60_000;
            let remaining_ms = (planned_ms - elapsed_ms).max(0);
            return format!("⏸ {}", format_elapsed_for_menu(remaining_ms, true));
        }
        return format!("⏸ {}", format_elapsed_for_menu(elapsed_ms, true));
    }

    let elapsed_ms = elapsed_ms.max(0);
    if let Some(planned_minutes) = planned_minutes.filter(|m| *m > 0) {
        let planned_ms = planned_minutes * 60_000;
        if elapsed_ms >= planned_ms {
            let _ = conn.execute(
                "UPDATE sessions
                 SET state='ended', ended_at=?1, paused_at=NULL
                 WHERE id=?2 AND state='active'",
                rusqlite::params![now.to_rfc3339(), session_id],
            );
            return "00:00".to_string();
        }
        return format_elapsed_for_menu((planned_ms - elapsed_ms).max(0), false);
    }

    format_elapsed_for_menu(elapsed_ms, false)
}

#[cfg(target_os = "macos")]
fn start_menu_timer_updater<R: tauri::Runtime + 'static>(
    app_handle: tauri::AppHandle<R>,
    db: Arc<Mutex<rusqlite::Connection>>,
) {
    std::thread::spawn(move || loop {
        let title = match db.lock() {
            Ok(conn) => compute_menu_timer_title(&conn, Utc::now()),
            Err(_) => "00:00".to_string(),
        };

        if let Some(tray) = app_handle.tray_by_id(MENU_TIMER_TRAY_ID) {
            let _ = tray.set_title(Some(title.as_str()));
        }

        std::thread::sleep(Duration::from_secs(1));
    });
}

#[cfg(target_os = "macos")]
fn setup_menu_bar_timer<R: tauri::Runtime + 'static>(
    app: &tauri::App<R>,
    db: Arc<Mutex<rusqlite::Connection>>,
) -> tauri::Result<()> {
    let quit = MenuItemBuilder::with_id(MENU_TIMER_QUIT_ID, "Quit").build(app)?;
    let tray_menu = MenuBuilder::new(app).item(&quit).build()?;

    let mut tray = TrayIconBuilder::with_id(MENU_TIMER_TRAY_ID)
        .menu(&tray_menu)
        .title("00:00")
        .icon_as_template(true)
        .show_menu_on_left_click(false)
        .on_menu_event(|app_handle, event| {
            if event.id().as_ref() == MENU_TIMER_QUIT_ID {
                app_handle.exit(0);
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                ..
            } = event
            {
                if let Some(window) = tray.app_handle().get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                }
            }
        });

    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }

    let _ = tray.build(app)?;
    start_menu_timer_updater(app.handle().clone(), db);
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
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

            #[cfg(target_os = "macos")]
            setup_menu_bar_timer(app, Arc::clone(&db))?;

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
            commands::sessions::day_planning_status,
            commands::sessions::session_end_stats,
            commands::sessions::log_sunlight,
            commands::sessions::log_gym,
            commands::sessions::log_book,
            commands::sessions::log_walk,
            commands::sessions::log_no_outside_food,
            commands::sessions::log_cold_shower,
            commands::sessions::log_meditation,
            commands::sessions::log_singing_practice,
            commands::sessions::unlog_habit,
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
            commands::rewards::inventory_list_consumed,
            commands::rewards::inventory_consume,
            commands::scoring::score_get_today,
            commands::scoring::score_get_overall,
            commands::scoring::timeline_get_for_day,
            commands::analytics::analytics_get_dashboard,
            commands::rules::rules_get_all,
            commands::rules::rules_upsert_app_rule,
            commands::rules::rules_upsert_site_rule,
            commands::tracker::tracker_get_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
