# dessert 🍨

> turn work into a game.

dessert is a macOS productivity app that gamifies your focus. earn points for deep work, lose points for doomscrolling, and spend them on real rewards like naps, ice cream, or a guilt-free YouTube break.

## how it works

- **earn** — start a focus session. hit 30, 60, 90, or 120 minutes for milestone bonuses. log daily habits (sunlight, gym, reading, walking, no outside food) for bonus points.
- **lose** — drift to X, LinkedIn, or YouTube while scrolling. grace period of 5 minutes, then penalty kicks in.
- **spend** — buy desserts (rewards) from the shop with your points. use them from your inventory.

## stack

| layer | tech |
|-------|------|
| shell | [tauri v2](https://tauri.app) (macOS) |
| ui | react 19 + typescript + tailwind css |
| backend | rust + rusqlite (sqlite, bundled) |
| tracker | lsappinfo + CoreGraphics (no special permissions) |
| browser | MV3 chrome/arc extension → localhost:43137 |

## run it

```bash
# prerequisites: rust (via rustup), node, pnpm
pnpm install
cd apps/desktop
pnpm tauri dev
```

## arc/chrome extension

1. open `chrome://extensions` (or arc's equivalent)
2. enable developer mode
3. click "load unpacked" → select `extensions/arc-tracker/`
4. browse X, LinkedIn, or YouTube — dessert will track it

## scoring

| event | points |
|-------|--------|
| start session (first 6 per day) | +5 |
| 30 min session milestone | +5 |
| 60 min session combo | +10 |
| 90 min session combo | +15 |
| 2 hr session combo | +20 |
| morning sunlight check-in | +10 |
| gym | +10 |
| read a book | +10 |
| go for a walk | +10 |
| no outside food | +10 |
| complete task | +15 |
| complete main quest | +25 |
| X/YT doomscroll (in session, per min) | −3 |
| X/YT doomscroll (ambient, per min) | −1 |

## project structure

```
dessert/
  apps/desktop/          # tauri app (react + rust)
    src/                 # react frontend
    src-tauri/           # rust backend
  extensions/arc-tracker/ # browser extension
```
