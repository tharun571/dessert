# dessert desktop app

Desktop client for `dessert`, built with Tauri + React + TypeScript.

## scripts

```bash
pnpm dev      # frontend only (vite)
pnpm tauri dev
pnpm build    # tsc + vite build
```

## architecture notes

- `src/`: React UI (Home, Tasks, Rewards, Inventory, Timeline, Analytics, Settings)
- `src-tauri/`: Rust backend, sqlite DB, tracker thread, browser bridge, command handlers
- Frontend calls backend via Tauri `invoke()` wrappers in `src/lib/api.ts`

## key runtime pieces

- **tracker** (`src-tauri/src/tracker.rs`): frontmost macOS app + idle detection tick loop
- **browser bridge** (`src-tauri/src/browser_bridge.rs`): receives MV3 extension batches on `127.0.0.1:43137`
- **analytics command** (`src-tauri/src/commands/analytics.rs`): serves day-wise dashboard + today 24h activity payload
