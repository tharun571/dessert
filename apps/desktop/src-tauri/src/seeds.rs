use rusqlite::{Connection, Result};
use uuid::Uuid;
use chrono::Utc;

pub fn seed_if_empty(conn: &Connection) -> Result<()> {
    let reward_count: i32 = conn.query_row(
        "SELECT COUNT(*) FROM rewards", [], |r| r.get(0)
    )?;
    if reward_count == 0 {
        seed_rewards(conn)?;
    }

    let app_rule_count: i32 = conn.query_row(
        "SELECT COUNT(*) FROM app_rules", [], |r| r.get(0)
    )?;
    if app_rule_count == 0 {
        seed_app_rules(conn)?;
    }

    let site_rule_count: i32 = conn.query_row(
        "SELECT COUNT(*) FROM site_rules", [], |r| r.get(0)
    )?;
    if site_rule_count == 0 {
        seed_site_rules(conn)?;
    }

    Ok(())
}

fn seed_rewards(conn: &Connection) -> Result<()> {
    let now = Utc::now().to_rfc3339();
    let rewards = vec![
        (Uuid::new_v4().to_string(), "Nap", 50, None::<i32>, 1, "none", None::<i32>),
        (Uuid::new_v4().to_string(), "Ice cream", 500, None, 1, "none", None),
        (Uuid::new_v4().to_string(), "Biriyani", 500, None, 1, "none", None),
        (Uuid::new_v4().to_string(), "Smoke", 1000, None, 1, "none", Some(120)),
        (Uuid::new_v4().to_string(), "1 TV episode", 250, None, 1, "none", None),
        (Uuid::new_v4().to_string(), "X break", 250, Some(20), 0, "x", None),
        (Uuid::new_v4().to_string(), "YouTube break", 250, Some(20), 0, "youtube", None),
        (Uuid::new_v4().to_string(), "Cold drink", 100, None, 0, "none", None),
        (Uuid::new_v4().to_string(), "Evening with the boys", 750, None, 1, "none", None),
    ];

    for (id, name, cost, duration, ends_session, scope, cooldown) in rewards {
        conn.execute(
            "INSERT INTO rewards (id, name, cost, duration_minutes, ends_session_on_consume, suppresses_scope, cooldown_minutes, enabled, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1, ?8)",
            rusqlite::params![id, name, cost, duration, ends_session, scope, cooldown, now],
        )?;
    }
    Ok(())
}

fn seed_app_rules(conn: &Connection) -> Result<()> {
    let now = Utc::now().to_rfc3339();
    let rules: Vec<(&str, &str, &str, &str, i32)> = vec![
        // (matcher_type, matcher_value, label, category, points_per_minute)
        ("app_name", "Zed", "Zed Editor", "positive", 1),
        ("app_name", "Code", "VS Code", "positive", 1),
        ("app_name", "Cursor", "Cursor", "positive", 1),
        ("app_name", "Terminal", "Terminal", "positive", 1),
        ("app_name", "iTerm2", "iTerm2", "positive", 1),
        ("app_name", "Warp", "Warp", "positive", 1),
        ("app_name", "Notion", "Notion", "positive", 1),
        ("app_name", "Obsidian", "Obsidian", "positive", 1),
        ("app_name", "Linear", "Linear", "positive", 1),
        ("bundle_id", "com.apple.finder", "Finder", "neutral", 0),
        ("bundle_id", "com.apple.Preview", "Preview", "neutral", 0),
        ("bundle_id", "com.apple.iCal", "Calendar", "neutral", 0),
        ("bundle_id", "com.apple.mail", "Mail", "neutral", 0),
        ("app_name", "Slack", "Slack", "neutral", 0),
        ("app_name", "MongoDB Compass", "MongoDB Compass", "positive", 1),
    ];

    for (matcher_type, matcher_value, label, category, ppm) in rules {
        conn.execute(
            "INSERT INTO app_rules (id, matcher_type, matcher_value, label, category, points_per_minute, enabled, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, ?7)",
            rusqlite::params![Uuid::new_v4().to_string(), matcher_type, matcher_value, label, category, ppm, now],
        )?;
    }
    Ok(())
}

fn seed_site_rules(conn: &Connection) -> Result<()> {
    let now = Utc::now().to_rfc3339();
    let sites = vec![
        ("x.com", "X / Twitter", "negative", 300, 3, 1, 1),
        ("twitter.com", "Twitter", "negative", 300, 3, 1, 1),
        ("linkedin.com", "LinkedIn", "negative", 300, 3, 1, 0),
        ("youtube.com", "YouTube", "negative", 300, 3, 1, 1),
        ("github.com", "GitHub", "positive", 300, 0, 0, 0),
        ("chat.openai.com", "ChatGPT", "positive", 300, 0, 0, 0),
        ("claude.ai", "Claude", "positive", 300, 0, 0, 0),
    ];

    for (domain, label, category, grace, penalty_session, penalty_ambient, reward_break) in sites {
        conn.execute(
            "INSERT INTO site_rules (id, domain, label, category, grace_seconds, penalty_per_minute_session, penalty_per_minute_ambient, reward_break_supported, enabled, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 1, ?9)",
            rusqlite::params![
                Uuid::new_v4().to_string(), domain, label, category,
                grace, penalty_session, penalty_ambient, reward_break, now
            ],
        )?;
    }
    Ok(())
}
