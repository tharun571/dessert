# AGENT.md — dessert codebase guide

> Read this before touching anything. It covers architecture, every file's purpose, IPC conventions, DB schema, scoring system, and gotchas that will burn you if you skip them.

---

## what is this

**dessert** is a macOS productivity gamification app built with Tauri v2. you earn points for deep work (tracked via macOS app detection), lose points for doomscrolling X/LinkedIn/YouTube (tracked via a browser extension), and spend points on real rewards (naps, food, breaks).

---

## repo layout

```
dessert/
  README.md                        — user-facing project overview
  AGENT.md                         — this file
  prd.md                           — original product requirements doc
  package.json                     — pnpm workspace root (no code here)
  pnpm-workspace.yaml              — declares apps/*, packages/*

  apps/desktop/                    — the main Tauri app
    index.html                     — html entry (title: "dessert")
    vite.config.ts                 — vite dev server on :1420
    tailwind.config.js             — extends with brand colors + glow keyframes
    postcss.config.js
    src/
      main.tsx                     — react entry point
      App.tsx                      — root: sidebar nav (6 items) + page router
      App.css                      — minimal resets
      index.css                    — tailwind + custom utilities + confettiFall keyframe
      lib/
        api.ts                     — ALL tauri invoke() wrappers (source of truth for IPC)
        types.ts                   — ALL typescript interfaces matching rust structs
        sounds.ts                  — web audio API synthesizer (no files, pure JS)
      features/
        home/
          HomePage.tsx             — merged dashboard+session: score banner, live timer,
                                     planning gate, sunlight prompt, tracker status, quest checklist
          SessionEndOverlay.tsx    — confetti overlay shown on session stop (records + summary)
        tasks/TasksPage.tsx        — quest management: today/tomorrow tabs, add/done/delete
        rewards/RewardsPage.tsx    — reward shop only (no inventory here)
        inventory/InventoryPage.tsx — inventory: list and consume available items
        timeline/TimelinePage.tsx  — score event feed with colored left-border accents
        settings/SettingsPage.tsx  — app/site rules viewer + scoring reference table

    src-tauri/
      tauri.conf.json              — app config: productName "dessert", window 1100×750
      Cargo.toml                   — rust dependencies
      src/
        main.rs                    — binary entry (just calls lib::run())
        lib.rs                     — AppState struct, Tauri builder, all command registrations
        db.rs                      — sqlite open + WAL mode + full schema migration + ALTER TABLE migrations
        models.rs                  — all rust structs (Session, Task, Reward, SessionEndStats, ...)
        seeds.rs                   — default rewards, app_rules, site_rules (runs once on first launch)
        tracker.rs                 — macOS background thread: app detection + scoring + combo milestones
        browser_bridge.rs          — HTTP server on :43137 receiving extension scroll events
        commands/
          mod.rs                   — declares all command submodules
          sessions.rs              — session CRUD + day_planning_status + log_sunlight + session_end_stats
          tasks.rs                 — task CRUD (create/update/mark_done/reopen/delete/list)
          rewards.rs               — reward CRUD + purchase + inventory consume
          scoring.rs               — score_get_today, score_get_overall, timeline_get_for_day
          rules.rs                 — rules_get_all, rules_upsert_app_rule, rules_upsert_site_rule
          tracker.rs               — tracker_get_status (reads TrackerState)

  extensions/arc-tracker/          — MV3 chrome/arc browser extension
    manifest.json                  — targets x.com, twitter.com, linkedin.com, youtube.com
    content.js                     — runs on target sites, tracks scroll/focus, sends to background
    background.js                  — batches samples, POSTs to http://127.0.0.1:43137/events
```

---

## tech stack

| layer | tech | version |
|-------|------|---------|
| shell | tauri | v2 |
| frontend | react + typescript | 19 |
| styling | tailwind css | v3.4 |
| bundler | vite | latest |
| package mgr | pnpm workspaces | |
| backend | rust | 2021 edition |
| database | sqlite via rusqlite | bundled |
| http bridge | tiny_http | 0.12 |

---

## how to run

```bash
cd apps/desktop
pnpm install        # first time only
pnpm tauri dev      # starts vite on :1420 + tauri shell
```

cargo check from src-tauri:
```bash
cd apps/desktop/src-tauri
source ~/.cargo/env
cargo check
```

---

## critical IPC convention — do not get this wrong

Tauri v2 maps JS argument keys **camelCase → snake_case** automatically.

**JavaScript (api.ts) must always use camelCase:**
```ts
invoke('session_pause', { sessionId: '...' })   // ✓ correct
invoke('session_pause', { session_id: '...' })  // ✗ will fail silently
```

**Rust command signatures use snake_case** (normal rust):
```rust
pub fn session_pause(state: State<AppState>, session_id: String) -> Result<Session, String>
```

**Every new command must be registered in `src-tauri/src/lib.rs`** inside `tauri::generate_handler![...]`. Forgetting this = command silently does nothing.

**Every new command needs a wrapper in `src/lib/api.ts`** and a TypeScript type in `src/lib/types.ts`.

---

## database schema (sqlite, local only)

DB file lives at the Tauri app data dir (`~/Library/Application Support/dessert/dessert.sqlite`).
All migrations run in `db.rs::migrate()`. New columns use explicit `ALTER TABLE ... ADD COLUMN` statements run before `CREATE TABLE IF NOT EXISTS` — they are wrapped in `let _ = conn.execute_batch(...)` to silently ignore "duplicate column" errors on re-run.

### tables

**settings** — key/value store for app config

**sessions**
- `id TEXT PK`, `started_at TEXT`, `ended_at TEXT?`, `state TEXT` (active|paused|ended)
- `planned_minutes INTEGER?`, `title TEXT?`, `score_total INTEGER DEFAULT 0`, `created_at TEXT`
- `paused_ms INTEGER DEFAULT 0` — total accumulated milliseconds spent paused
- `paused_at TEXT?` — timestamp of when the current pause started (NULL when active/ended)
- only one session can be `active` at a time — `session_start` auto-ends any existing active session
- **timer formula**: `(ended_at_or_now - started_at) - paused_ms` = actual work time

**tasks**
- `id TEXT PK`, `title TEXT`, `planned_for TEXT` (ISO date "2026-03-22"), `estimated_minutes?`
- `is_main_quest INTEGER` (0/1), `status TEXT` (planned|done|skipped)
- `completed_at TEXT?`, `completion_source TEXT`, `llm_verdict_json TEXT?`, `notes TEXT?`
- filtered by `planned_for` exact string match — frontend passes local date via `todayDate()`
- **idempotency**: `task_mark_done` checks current status before awarding points — re-completing a done task does NOT award points again

**rewards**
- `id TEXT PK`, `name TEXT UNIQUE`, `cost INTEGER`, `duration_minutes?`
- `ends_session_on_consume INTEGER` (0/1), `suppresses_scope TEXT?` (x|youtube|linkedin|none)
- `cooldown_minutes?`, `enabled INTEGER` (soft delete — set enabled=0 to "delete")

**inventory_items**
- items purchased from the shop. FK to rewards.
- `status TEXT` (available|consumed|expired)
- `purchase_session_id?`, `consume_session_id?`
- managed separately from shop — `InventoryPage.tsx` lists/consumes, `RewardsPage.tsx` only buys

**app_rules**
- `matcher_type TEXT` (bundle_id|app_name), `matcher_value TEXT`, `label TEXT`
- `category TEXT` (positive|neutral|negative), `points_per_minute INTEGER`, `enabled INTEGER`

**site_rules**
- `domain TEXT UNIQUE` (e.g. "x.com", no www prefix), `category TEXT`
- `grace_seconds INTEGER DEFAULT 300`, `penalty_per_minute_session INTEGER DEFAULT 3`
- `penalty_per_minute_ambient INTEGER DEFAULT 1`, `reward_break_supported INTEGER`

**active_effects** — temporary suppression from consumed reward breaks
- `scope TEXT` (x|youtube|linkedin), `ends_at TEXT`, `consumed INTEGER`
- checked by browser_bridge to suppress penalties during a bought break

**raw_events** — raw telemetry from tracker and browser extension
- `source TEXT` (mac_app|arc_ext|user|system|llm), `event_type TEXT`, `payload_json TEXT`

**score_events** — every point change, ever
- `delta INTEGER`, `reason_code TEXT`, `explanation TEXT`, `session_id?`, `related_event_id?`
- this is the ledger; never delete rows from here

**nudge_events** — reserved for future notification system

---

## all reason_codes in score_events

| reason_code | delta | trigger |
|---|---|---|
| `session_started` | +5 | session_start command |
| `sunlight` | +10 | log_sunlight command (morning check-in, once per day) |
| `productive_minute` | +1 | tracker: positive app active during session |
| `combo_bonus` | +5 | tracker: 25min consecutive productive streak |
| `session_combo_60` | +10 | tracker: session reaches 60 min of active work |
| `session_combo_90` | +15 | tracker: session reaches 90 min of active work |
| `session_combo_120` | +20 | tracker: session reaches 2 hrs of active work |
| `task_completed` | +15 | task_mark_done (normal task) |
| `main_quest_completed` | +25 | task_mark_done when is_main_quest=1 |
| `red_site_penalty` | −3/min | browser_bridge: in-session doomscroll |
| `ambient_red_site_penalty` | −1/min | browser_bridge: doomscroll outside session |
| `reward_purchased` | −cost | reward_purchase command |

to add a new score event anywhere: INSERT into `score_events` then UPDATE `sessions SET score_total = score_total + delta WHERE id = session_id`.

combo milestone reason codes (`session_combo_*`) are idempotent — checked with `SELECT COUNT(*) FROM score_events WHERE session_id=? AND reason_code=?` before inserting.

---

## AppState — shared state across threads

```rust
pub struct AppState {
    pub db: Arc<Mutex<rusqlite::Connection>>,      // shared with tracker + bridge threads
    pub tracker: Arc<Mutex<tracker::TrackerState>>,
    pub bridge: Arc<Mutex<browser_bridge::BridgeState>>,
}
```

**lock order**: always lock `db` first, then `bridge` or `tracker`. never hold both `bridge` and `db` locks simultaneously in the same thread (deadlock risk — see browser_bridge.rs where db is explicitly dropped before re-acquiring).

---

## tracker.rs — macOS app scoring

Background thread, 60s tick (5s startup delay). No special permissions needed.

- **`get_frontmost_app()`** — runs `lsappinfo front` CLI, parses `name=` and `bundleID=` fields
- **`get_idle_seconds()`** — calls CoreGraphics `CGEventSourceSecondsSinceLastEventType` via extern C
- AFK threshold: 600s of idle → stop scoring, mark idle
- Scoring in active session: +1/min for positive apps, combo +5 at 25min streak, −3/min for negative apps
- Scoring ambient (no session): −1/min for negative apps

**time-based combo milestones** (checked every tick against active session):
- 60 min of actual work time (paused_ms excluded) → `session_combo_60` +10, once per session
- 90 min → `session_combo_90` +15, once per session
- 120 min → `session_combo_120` +20, once per session

elapsed calculation: `((now - started_at).num_milliseconds() - paused_ms) / 60_000`

---

## browser_bridge.rs — localhost HTTP server

Binds `127.0.0.1:43137`. Receives POST batches from the Arc/Chrome extension.

**Grace period logic per domain:**
1. accumulate `active_scroll_ms` per visit
2. first 300,000ms (5 min) = grace, no penalty
3. after grace: bill in 60,000ms (1 min) increments → emits score_event
4. visit resets if away from site for 90s (`VISIT_RESET_SECS = 90`)
5. penalty suppressed if matching `active_effects` row exists (bought break)

**Domain → scope mapping:** `x.com/twitter.com → "x"`, `youtube.com → "youtube"`, `linkedin.com → "linkedin"`

`BridgeState` holds a `HashMap<String, SiteVisit>` in memory (not persisted across app restarts).

---

## day_planning_status — the daily gate

`day_planning_status(local_date, local_tomorrow_date, hour)` is called on every 5s refresh.

Returns `DayPlanningStatus`:
- `needs_planning`: true if zero tasks for today AND zero sessions today → blocks session start
- `ask_sunlight`: true if `hour < 12` AND zero sessions today AND `sunlight` not in score_events today
- `suggest_tomorrow`: true if `hour >= 17` AND zero tasks for tomorrow

**session_start guard**: if `needs_planning` would be true at start time, `session_start` returns an Err.

**timezone**: frontend always passes `todayDate()` = `new Date().toISOString().slice(0,10)`. backend never computes "today" on its own for date-gated logic.

---

## session end celebration

When `handleStop` is called in `HomePage.tsx`:
1. `sessionStop(id)` — marks session ended, returns full Session
2. `sessionEndStats(id)` — checks if this session is the longest today / this week / ever (excluding paused time)
3. `playCelebrate()` — 5-tone rising fanfare via Web Audio
4. `SessionEndOverlay` renders: confetti particles + duration/score summary + record badge
5. overlay auto-dismisses after 4s or on click

`session_end_stats` command computes: `(julianday(ended_at) - julianday(started_at)) * 86400000 - paused_ms` for this and all other ended sessions, returns `is_longest_today`, `is_longest_week`, `is_longest_ever`.

---

## frontend conventions

### routing
`App.tsx` holds a `page` state string. no react-router. nav items: `home`, `tasks`, `rewards`, `inventory`, `timeline`, `settings`. home page is the merged dashboard+session page (no separate session nav item). sidebar shows tooltips on hover via `group`/`group-hover` Tailwind pattern.

### data fetching
- every page fetches its own data in a `refresh` callback wrapped in `useCallback`
- polled every 5s via `setInterval` in a `useEffect` (10s for timeline)
- all state is local to each page — no global store

### error handling
wrap all async handlers in a `run()` helper:
```ts
const run = async (fn: () => Promise<void>) => {
  setError('');
  setLoading(true);
  try { await fn(); }
  catch (e) { setError(String(e)); playError(); }
  finally { setLoading(false); }
};
```

### sounds (sounds.ts)
all synthesized via Web Audio API — no external audio files.
```ts
playClick()      // nav taps, cancel buttons, minor actions
playSuccess()    // session resume
playComplete()   // task/quest marked done
playPurchase()   // reward bought
playError()      // on catch
playCelebrate()  // session end (5-tone rising fanfare)
```

### styling patterns
- dark base: body has `radial-gradient(ellipse at 20% 20%, #1c1209, #0a0a0a, #0d0d14)`
- cards: `bg-zinc-900/60 border border-white/5 rounded-2xl`
- active/glowing cards: `card-glow-orange`, `card-glow-emerald`, `card-glow-amber`, `card-glow-violet`
- `card-hover` — adds `translateY(-1px)` on hover
- `btn-glow-orange` — adds orange box-shadow on hover
- gradient text: `text-gradient-orange`, `text-gradient-score-pos`, `text-gradient-score-neg`
- primary buttons: inline `style={{ background: 'linear-gradient(135deg, #f97316, #fb923c)' }}`
- confetti animation: `@keyframes confettiFall` in `index.css`, used by `SessionEndOverlay`

### all text is lowercase
branding convention: everything in the UI is lowercase ("dessert", "quests", "start session", etc.)

---

## seeds.rs — first-launch defaults

Runs `seed_if_empty()` on startup. Only seeds if the table is empty.

**Default rewards (costs post-10x multiplier):** Nap (50pt), Cold drink (100pt), 1 TV episode (250pt), X break (250pt, suppresses "x" 20min), YouTube break (250pt, suppresses "youtube" 20min), Ice cream (500pt), Biriyani (500pt), Evening with the boys (750pt), Smoke (1000pt, 2h cooldown)

**Default positive apps:** Zed, VS Code, Cursor, Terminal, iTerm2, Warp, Xcode, Notion, Obsidian, Linear, Figma, Slack, Postman

**Default neutral apps:** Finder, Preview, Calendar, System Preferences, Mail

**Default site rules (negative):** x.com, twitter.com, linkedin.com, youtube.com — all with 300s grace, −3/min session, −1/min ambient

---

## how to add a new feature — checklist

**new rust command:**
1. implement `pub fn my_command(state: State<AppState>, ...) -> Result<T, String>` in the relevant `commands/*.rs` file
2. register in `src-tauri/src/lib.rs` inside `generate_handler![..., commands::module::my_command]`
3. if it returns a new struct, add the struct to `models.rs` with `#[derive(Debug, Clone, Serialize, Deserialize)]`

**new frontend API:**
1. add wrapper in `src/lib/api.ts`: `invoke<ReturnType>('my_command', { camelCaseArgs })`
2. add TypeScript interface to `src/lib/types.ts` if new struct

**new score event type:**
1. INSERT into `score_events` with a new `reason_code`
2. add the emoji + color + border to `REASON_META` in `TimelinePage.tsx`
3. optionally update `score_get_today()` in `scoring.rs` if the new event type needs special bucketing

**new DB column:**
1. add `let _ = conn.execute_batch("ALTER TABLE ... ADD COLUMN ...");` to `db.rs::migrate()` BEFORE the `conn.execute_batch("CREATE TABLE IF NOT EXISTS ...")` block
2. update the relevant `row_to_*` function and SELECT queries in the command file
3. update the struct in `models.rs` and the TypeScript interface in `types.ts`

---

## known gotchas

- **sqlite is single connection, mutex-guarded** — never hold the db lock across an await or a long computation. always drop it before doing anything async.
- **timestamps are UTC RFC3339 in the DB** (`Utc::now().to_rfc3339()`), but "today" for date filtering is always passed from the frontend as a local date string (YYYY-MM-DD). mixing these will cause date boundary bugs at midnight.
- **`score_total` on sessions is denormalized** — updated in place whenever a score_event is inserted with a `session_id`. always follow score_event inserts with `UPDATE sessions SET score_total = score_total + delta WHERE id = session_id`.
- **reward "delete" is soft** — `enabled=0`, not a real DELETE. `reward_list()` filters `WHERE enabled=1`.
- **sqlite booleans are stored as INTEGER 0/1** — always cast with `row.get::<_, i32>(n)? != 0` when reading booleans from rows.
- **the tracker thread sleeps 60s between ticks** — scoring granularity is 1 minute.
- **browser_bridge BridgeState is not persisted** — in-memory only. grace period resets on app restart.
- **paused_ms is in milliseconds, i64** — combo milestone elapsed uses `num_milliseconds()`, not `num_minutes()`, to avoid precision loss before subtracting paused_ms.
- **task_mark_done is idempotent** — reads `status` before awarding points. calling it twice on a done task is safe (no double points).
- **session_end_stats uses `>=` for record comparison** — a session that ties the record is considered a record. this means the first session of the day is always "longest today".
