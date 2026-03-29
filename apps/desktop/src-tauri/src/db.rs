use rusqlite::{Connection, Result};
use std::path::PathBuf;

pub fn open(path: PathBuf) -> Result<Connection> {
    let conn = Connection::open(path)?;
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;
    migrate(&conn)?;
    Ok(conn)
}

fn migrate(conn: &Connection) -> Result<()> {
    // Add paused_ms / paused_at to sessions if not already present (idempotent)
    let _ =
        conn.execute_batch("ALTER TABLE sessions ADD COLUMN paused_ms INTEGER NOT NULL DEFAULT 0;");
    let _ = conn.execute_batch("ALTER TABLE sessions ADD COLUMN paused_at TEXT;");

    conn.execute_batch("
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value_json TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            started_at TEXT NOT NULL,
            ended_at TEXT,
            state TEXT NOT NULL CHECK (state IN ('active','paused','ended')),
            planned_minutes INTEGER,
            title TEXT,
            score_total INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            planned_for TEXT NOT NULL,
            estimated_minutes INTEGER,
            is_main_quest INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL CHECK (status IN ('planned','done','skipped')) DEFAULT 'planned',
            completed_at TEXT,
            completion_source TEXT NOT NULL DEFAULT 'manual',
            llm_verdict_json TEXT,
            notes TEXT,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS rewards (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            cost INTEGER NOT NULL CHECK (cost >= 0),
            duration_minutes INTEGER,
            ends_session_on_consume INTEGER NOT NULL DEFAULT 1,
            suppresses_scope TEXT CHECK (suppresses_scope IN ('x','youtube','linkedin','none')),
            cooldown_minutes INTEGER,
            enabled INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS inventory_items (
            id TEXT PRIMARY KEY,
            reward_id TEXT NOT NULL REFERENCES rewards(id) ON DELETE CASCADE,
            purchased_at TEXT NOT NULL,
            consumed_at TEXT,
            status TEXT NOT NULL CHECK (status IN ('available','consumed','expired')) DEFAULT 'available',
            purchase_session_id TEXT REFERENCES sessions(id),
            consume_session_id TEXT REFERENCES sessions(id)
        );

        CREATE TABLE IF NOT EXISTS app_rules (
            id TEXT PRIMARY KEY,
            matcher_type TEXT NOT NULL CHECK (matcher_type IN ('bundle_id','app_name')),
            matcher_value TEXT NOT NULL,
            label TEXT NOT NULL,
            category TEXT NOT NULL CHECK (category IN ('positive','neutral','negative')),
            points_per_minute INTEGER NOT NULL DEFAULT 0,
            enabled INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS site_rules (
            id TEXT PRIMARY KEY,
            domain TEXT NOT NULL UNIQUE,
            label TEXT NOT NULL,
            category TEXT NOT NULL CHECK (category IN ('positive','neutral','negative')),
            grace_seconds INTEGER NOT NULL DEFAULT 300,
            penalty_per_minute_session INTEGER NOT NULL DEFAULT 3,
            penalty_per_minute_ambient INTEGER NOT NULL DEFAULT 1,
            reward_break_supported INTEGER NOT NULL DEFAULT 0,
            enabled INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS active_effects (
            id TEXT PRIMARY KEY,
            inventory_item_id TEXT NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
            effect_type TEXT NOT NULL CHECK (effect_type IN ('site_penalty_suppression')),
            scope TEXT NOT NULL CHECK (scope IN ('x','youtube','linkedin')),
            started_at TEXT NOT NULL,
            ends_at TEXT NOT NULL,
            consumed INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS raw_events (
            id TEXT PRIMARY KEY,
            ts TEXT NOT NULL,
            source TEXT NOT NULL CHECK (source IN ('mac_app','arc_ext','user','system','llm')),
            event_type TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            session_id TEXT REFERENCES sessions(id)
        );

        CREATE TABLE IF NOT EXISTS score_events (
            id TEXT PRIMARY KEY,
            ts TEXT NOT NULL,
            session_id TEXT REFERENCES sessions(id),
            delta INTEGER NOT NULL,
            reason_code TEXT NOT NULL,
            explanation TEXT NOT NULL,
            related_event_id TEXT REFERENCES raw_events(id)
        );

        CREATE TABLE IF NOT EXISTS nudge_events (
            id TEXT PRIMARY KEY,
            ts TEXT NOT NULL,
            session_id TEXT REFERENCES sessions(id),
            channel TEXT NOT NULL CHECK (channel IN ('notification','banner','tray')),
            kind TEXT NOT NULL,
            message TEXT NOT NULL,
            related_event_id TEXT REFERENCES raw_events(id),
            acted_on INTEGER NOT NULL DEFAULT 0
        );
    ")?;
    Ok(())
}
