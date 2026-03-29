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
      App.tsx                      — root: sidebar nav (8 items) + page router
      App.css                      — minimal resets
      index.css                    — tailwind + custom utilities + confettiFall keyframe
      components/
        QuestReflectionModal.tsx   — mandatory 3-question reflection modal before quest completion;
                                     appends timestamped reflection to task notes
      lib/
        api.ts                     — ALL tauri invoke() wrappers (source of truth for IPC)
        types.ts                   — ALL typescript interfaces matching rust structs
        sounds.ts                  — web audio API synthesizer (no files, pure JS)
      features/
        home/
          HomePage.tsx             — merged dashboard+session: score banner, live timer,
                                     planned-duration countdown + auto-stop support,
                                     planning gate, sunlight/gym prompts, tracker status,
                                     quest checklist, today/all-time score cards
          SessionEndOverlay.tsx    — confetti overlay shown on session stop (records + summary)
        tasks/TasksPage.tsx        — quest management: today/tomorrow tabs,
                                     add/done/reopen/delete quests, carried-over task badge,
                                     reflection modal before marking done
        habits/HabitsPage.tsx      — dedicated daily habits page (toggle log/unlog)
        rewards/RewardsPage.tsx    — "desserts" shop: buy rewards, shows balance, greys out
                                     unaffordable items, inline edit/delete
        inventory/InventoryPage.tsx — inventory: available items (use button) + used items history
                                      grouped by consumed date
        timeline/TimelinePage.tsx  — today/overall tabs: score stats + event feed + full-width
                                     24h activity line (focus/idle segments + event dots)
        analytics/AnalyticsPage.tsx — last 7 days day-wise trend cards/charts with horizontal
                                      dates (work/sessions/points/quests/net points)
        settings/SettingsPage.tsx  — app/site rules viewer + scoring reference table

    src-tauri/
      tauri.conf.json              — app config: productName "dessert", window 1100×750
      Cargo.toml                   — rust dependencies
      src/
        main.rs                    — binary entry (just calls lib::run())
        lib.rs                     — AppState struct, Tauri builder, command registrations, macOS menu-bar timer
        db.rs                      — sqlite open + WAL mode + full schema migration + ALTER TABLE migrations
        models.rs                  — all rust structs (Session, Task, Reward, SessionEndStats, DayPlanningStatus, ...)
        seeds.rs                   — default rewards, app_rules, site_rules (runs once on first launch)
        tracker.rs                 — macOS background thread: app detection + scoring + combo milestones
        browser_bridge.rs          — HTTP server on :43137 receiving extension scroll events
        commands/
          mod.rs                   — declares all command submodules
          sessions.rs              — session CRUD + day_planning_status + habit logging (sunlight/gym/book/walk/no_outside_food/cold_shower/meditation/singing_practice) + unlog_habit + session_end_stats
          tasks.rs                 — task CRUD (create/update/mark_done/reopen/delete/list)
          rewards.rs               — reward CRUD + purchase + inventory consume
          scoring.rs               — score_get_today, score_get_overall, timeline_get_for_day
          analytics.rs             — analytics_get_dashboard (daywise metrics + today activity)
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

DB file lives at the Tauri app data dir (`~/Library/Application Support/com.dessert.app/dessert.sqlite`).
All migrations run in `db.rs::migrate()`. New columns use explicit `ALTER TABLE ... ADD COLUMN` statements run before `CREATE TABLE IF NOT EXISTS` — they are wrapped in `let _ = conn.execute_batch(...)` to silently ignore "duplicate column" errors on re-run.

### tables

**settings** — key/value store for app config

**sessions**
- `id TEXT PK`, `started_at TEXT`, `ended_at TEXT?`, `state TEXT` (active|paused|ended)
- `planned_minutes INTEGER?`, `title TEXT?`, `score_total INTEGER DEFAULT 0`, `created_at TEXT`
- `paused_ms INTEGER DEFAULT 0` — total accumulated milliseconds spent paused
- `paused_at TEXT?` — timestamp of when the current pause started (NULL when active/ended)
- only one session can be `active` at a time — `session_start` auto-ends any existing active session
- **elapsed work formula**: `(ended_at_or_now - started_at) - paused_ms` = actual work time
- `session_stop` (including stop-from-paused) folds current pause segment into `paused_ms` before ending
- `planned_minutes` is optional; when set, UI/menu-bar shows a countdown and auto-stops at zero

**tasks**
- `id TEXT PK`, `title TEXT`, `planned_for TEXT` (ISO date "2026-03-22"), `estimated_minutes?`
- `is_main_quest INTEGER` (0/1), `status TEXT` (planned|done|skipped)
- `completed_at TEXT?`, `completion_source TEXT`, `llm_verdict_json TEXT?`, `notes TEXT?`
- **carryover**: `task_list_for_date` returns tasks where `planned_for = date OR (planned_for < date AND status = 'planned')` — uncompleted tasks from prior days show up automatically with a "↩ carried over" badge
- **idempotency**: `task_mark_done` checks current status before awarding points — re-completing a done task does NOT award points again
- **reopen deducts points**: `task_reopen` inserts a negative `task_reopened` score event to reverse the completion bonus
- **quest reflection capture**: quest completion UI collects 3 reflection answers and appends them into `tasks.notes` with timestamp

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
| `session_started` | +5 | session_start (first 6 sessions of the day only) |
| `session_combo_30` | +5 | tracker: session reaches 30 min of active work |
| `session_combo_60` | +10 | tracker: session reaches 60 min of active work |
| `session_combo_90` | +15 | tracker: session reaches 90 min of active work |
| `session_combo_120` | +20 | tracker: session reaches 2 hrs of active work |
| `session_combo_180` | +30 | tracker: session reaches 3 hrs of active work |
| `sunlight` | +10 | log_sunlight (morning check-in, once per day, toggleable) |
| `gym` | +10 | log_gym (once per day, toggleable) |
| `book` | +10 | log_book (once per day, toggleable) |
| `walk` | +10 | log_walk (once per day, toggleable) |
| `no_outside_food` | +10 | log_no_outside_food (once per day, toggleable) |
| `cold_shower` | +50 | log_cold_shower (once per day, toggleable) |
| `meditation` | +50 | log_meditation (once per day, toggleable) |
| `singing_practice` | +50 | log_singing_practice (once per day, toggleable) |
| `task_completed` | +15 | task_mark_done (normal task) |
| `main_quest_completed` | +25 | task_mark_done when is_main_quest=1 |
| `task_reopened` | −15 or −25 | task_reopen — reverses completion bonus |
| `red_site_penalty` | −3/min | browser_bridge: in-session doomscroll |
| `ambient_red_site_penalty` | −1/min | browser_bridge: doomscroll outside session |
| `reward_purchased` | −cost | reward_purchase command |

to add a new score event anywhere: INSERT into `score_events` then UPDATE `sessions SET score_total = score_total + delta WHERE id = session_id`.

combo milestone reason codes (`session_combo_*`) are idempotent — checked with `SELECT COUNT(*) FROM score_events WHERE session_id=? AND reason_code=?` before inserting.

habit reason codes (`sunlight`, `gym`, `book`, `walk`, `no_outside_food`, `cold_shower`, `meditation`, `singing_practice`) are toggleable — `unlog_habit(reason_code, local_date)` deletes the positive score event for that habit on that date.

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

- **`get_frontmost_app()`** — two-step: `lsappinfo front` returns the ASN (e.g. `ASN:0x0-0x10010:`), then `lsappinfo info <ASN>` returns full details including `name` and `bundleID`. This is required on macOS 15+ where `lsappinfo front` no longer inlines app details.
- **`get_idle_seconds()`** — calls CoreGraphics `CGEventSourceSecondsSinceLastEventType` via extern C
- AFK threshold: 600s of idle → stop scoring, mark idle
- when idle and a session is live, tracker auto-pauses that active session
- Scoring in active session: −3/min for negative apps
- Scoring ambient (no session): −1/min for negative apps

**time-based combo milestones** (checked every tick against active session, each fires once per session):
- 30 min of actual work time → `session_combo_30` +5
- 60 min → `session_combo_60` +10
- 90 min → `session_combo_90` +15
- 120 min → `session_combo_120` +20
- 180 min → `session_combo_180` +30

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

## analytics + timeline activity

`analytics_get_dashboard(local_date, days)` returns:
- `daywise[]` (zero-filled contiguous days): `work_ms`, `sessions_started`, `points_earned`, `points_spent`, `quests_completed`
- `today_summary`: `work_ms`, `idle_ms`, `sessions_started`, `points_earned`, `quests_completed`
- `today_activity`: `segments[]` (`focus`/`idle`) + `dots[]` (dessert buy/use, habits, penalties, milestones, tasks, other)

`TimelinePage.tsx` uses this payload for the 24h activity line (placed between top number cards and the event feed).
`AnalyticsPage.tsx` renders separate day-wise charts with horizontal date labels and includes net points graph (`points_earned - points_spent`).

---

## macOS menu-bar timer

Implemented in `src-tauri/src/lib.rs` (macOS-gated):
- creates a tray/menu-bar item with a title that updates every second
- displays `00:00` with no session
- displays elapsed timer for unplanned active sessions
- displays remaining timer for planned sessions (and `⏸` when paused)
- auto-ends active planned sessions when remaining reaches zero
- tray click restores/focuses the main window, tray menu includes `Quit`

---

## day_planning_status — the daily gate

`day_planning_status(local_date, local_tomorrow_date, hour)` is called on every 5s refresh.

Returns `DayPlanningStatus`:
- `needs_planning`: true if zero tasks for today (including carried-over planned tasks from prior days) AND zero sessions today → blocks session start
- `ask_sunlight`: true if `hour < 12` AND zero sessions today AND `sunlight` not in score_events today
- `ask_gym`: true if `hour >= 18` AND zero sessions started at or after 6pm today AND `gym` not logged today
- `suggest_tomorrow`: true if `hour >= 17` AND zero tasks for tomorrow
- `sunlight_done`, `gym_done`, `book_done`, `walk_done`, `no_outside_food_done`, `cold_shower_done`, `meditation_done`, `singing_practice_done`: boolean habit completion state for today
- `*_at` fields: RFC3339 timestamp of when each habit was logged (null if not done)

**session_start guard**: if task count (today's tasks + carried-over uncompleted tasks) is zero AND no sessions today, `session_start` returns an Err. Carried-over tasks bypass the planning gate.

**timezone**: frontend always passes `todayDate()` = `new Date().toISOString().slice(0,10)`. backend never computes "today" on its own for date-gated logic.

---

## session start bonus cap

`session_started` +5 is only awarded for the **first 6 sessions of the day**. The `session_count` is checked at `session_start` time — if `session_count >= 6`, no score event is inserted for that session start.

---

## task carryover

`task_list_for_date(date)` uses:
```sql
WHERE planned_for = date OR (planned_for < date AND status = 'planned')
ORDER BY is_main_quest DESC, planned_for ASC, created_at ASC
```
Uncompleted tasks from prior days appear in today's list with a "↩ carried over" badge. The planning gate counts these tasks, so if carryover tasks exist you can start a session without adding new quests.

---

## session end celebration

When session ends from manual stop or planned-duration countdown auto-stop in `HomePage.tsx`:
1. `sessionStop(id)` — marks session ended, returns full Session
2. `sessionEndStats(id)` — checks if this session is the longest today / this week / ever (excluding paused time)
3. `playCelebrate()` — 5-tone rising fanfare via Web Audio
4. `SessionEndOverlay` renders: confetti particles + duration/score summary + record badge
5. overlay auto-dismisses after 4s or on click

`session_end_stats` command computes: `(julianday(ended_at) - julianday(started_at)) * 86400000 - paused_ms` for this and all other ended sessions, returns `is_longest_today`, `is_longest_week`, `is_longest_ever`.

---

## frontend conventions

### routing
`App.tsx` holds a `page` state string. no react-router. nav items: `home`, `tasks`, `habits`, `desserts` (rewards), `inventory`, `timeline`, `analytics`, `settings`. home page is the merged dashboard+session page. sidebar shows tooltips on hover via `group`/`group-hover` Tailwind pattern.

### data fetching
- every page fetches its own data in a `refresh` callback wrapped in `useCallback`
- polling is page-specific: home 5s, timeline/analytics/habits 10s, others mostly on-demand refresh
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

### text style
most UI copy is lowercase ("dessert", "quests", "start session"), with intentional sentence-case exceptions (for example quest reflection questions).

---

## seeds.rs — first-launch defaults

Runs `seed_if_empty()` on startup. Only seeds if the table is empty.

**Default rewards:** Nap (50pt), Cold drink (100pt), 1 TV episode (250pt), X break (250pt, suppresses "x" 20min), YouTube break (250pt, suppresses "youtube" 20min), Ice cream (500pt), Biriyani (500pt), Evening with the boys (750pt), Smoke (1000pt, 2h cooldown)

**Default positive apps:** Zed, VS Code, Cursor, Terminal, iTerm2, Warp, Notion, Obsidian, Linear, MongoDB Compass

**Default neutral apps:** Finder, Preview, Calendar, Mail, Slack

**Default site rules:** negative = x.com, twitter.com, linkedin.com, youtube.com (300s grace, −3/min session, −1/min ambient); positive = github.com, chat.openai.com, claude.ai.

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

**new habit:**
1. add `log_<habit>` command in `commands/sessions.rs` (idempotent: check score_events before inserting)
2. add `<habit>_done: bool` and `<habit>_at: Option<String>` to `DayPlanningStatus` in `models.rs` and `types.ts`
3. register command in `lib.rs`, add API wrapper in `api.ts`
4. add habit entry to the habits array in `HabitsPage.tsx` and any prompt card in `HomePage.tsx`
5. add `reason_code` to `REASON_META` in `TimelinePage.tsx`

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
- **stop from paused must finalize pause duration** — if you add new stop paths, always fold `(now - paused_at)` into `paused_ms` before setting `state='ended'`.
- **task_mark_done is idempotent** — reads `status` before awarding points. calling it twice on a done task is safe (no double points).
- **session_end_stats uses `>=` for record comparison** — a session that ties the record is considered a record. this means the first session of the day is always "longest today".
- **lsappinfo two-step** — `lsappinfo front` only returns the ASN on macOS 15+. must follow with `lsappinfo info <ASN>` to get name/bundleID. using just `lsappinfo front` output for parsing will silently return nothing.
- **rusqlite positional params** — if using `?1` multiple times in a query, only pass ONE value in `params![]` (SQLite counts unique param indices, not occurrences). using `params![val, val]` for a query with two `?1` references causes a "wrong number of parameters" error that silently returns unwrap_or default.
- **habit unlog deletes the score event** — `unlog_habit` does `DELETE FROM score_events WHERE reason_code=? AND date(ts)=? AND delta > 0`. this means the habit's points disappear from total score cleanly, but there's no audit trail that it was ever logged.
