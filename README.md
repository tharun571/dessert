# dessert 🍨

> turn work into game.

`dessert` is a desktop productivity app for macOS and Windows that gamifies focus sessions.

- earn points for focused work and healthy habits
- lose points for doomscrolling negative apps/sites
- spend points on real rewards ("desserts")

## core features

- **focus sessions**: start/pause/resume/stop, optional planned-duration countdown, combo milestones at 30/60/90/120/180 minutes, and auto-pause when idle for 10+ minutes.
- **tray timer (macOS)**: always-on menu-bar timer on macOS (`00:00` idle, running during active session, `⏸` while paused).
- **windows tray**: restore/quit tray icon on Windows; the live text timer remains macOS-only.
- **tasks + habits**: quests, main quest bonus, mandatory 3-question reflection on quest completion, daily habit logging (including cold shower, meditation, singing practice).
- **rewards + inventory**: buy rewards, consume later, optional penalty suppression windows.
- **timeline**: today's score events plus a full-width **24h activity line** with focus/idle segments and event dots.
- **analytics**: separate day-by-day comparisons (last 7 days from today) for:
  - work hours
  - sessions started
  - points earned
  - quests completed
  - net points (`earned - spent`)
  - auto-refreshing cards/charts

## stack

| layer | tech |
|-------|------|
| shell | [tauri v2](https://tauri.app) |
| ui | react 19 + typescript + tailwind css |
| backend | rust + rusqlite (sqlite, bundled) |
| tracker | platform-native foreground app + idle detection |
| browser | MV3 extension (Chromium browsers) → localhost bridge (`127.0.0.1:43137`) |

## run locally

```bash
# prerequisites: rust (via rustup), node, pnpm
pnpm install
cd apps/desktop
pnpm tauri dev
```

## browser extension setup (Chromium browsers)

1. Open `chrome://extensions` (or the extensions page in Edge / Arc where available)
2. Enable developer mode
3. Click "Load unpacked" and select `extensions/arc-tracker/`
4. Browse tracked sites (X/Twitter, LinkedIn, YouTube)

## scoring highlights

| event | points |
|-------|--------|
| start session (first 6/day) | +5 |
| 30 min combo | +5 |
| 60 min combo | +10 |
| 90 min combo | +15 |
| 120 min combo | +20 |
| 180 min combo | +30 |
| sunlight / gym / book / walk / no outside food | +10 each |
| cold shower / meditation / singing practice | +50 each |
| complete task | +15 |
| complete main quest | +25 |
| reopen task | -15 / -25 |
| reward purchase | -cost |
| doomscroll in session (per min) | -3 |
| doomscroll ambient (per min) | -1 |

## project structure

```text
dessert/
  apps/desktop/             # tauri app (react + rust)
    src/                    # frontend pages/components
    src-tauri/              # rust commands, tracker, bridge, db
  extensions/arc-tracker/   # mv3 browser tracker extension
```
