# Slate

A personal, local-first desktop notes app for code and life notes. Markdown files on disk, WYSIWYG editing, full-text search, no cloud.

See `.claude/PROJECT-VISION.md` for the vision, `.claude/TECHSTACK.md` for stack rationale, `.claude/ARCHITECTURE.md` for the structural design.

## Tech Stack

- **Language**: TypeScript (strict)
- **Runtime**: Electron
- **UI**: React + Tailwind CSS v4 + Lucide icons
- **Editor**: CodeMirror 6
- **Data**: Markdown files on disk; SQLite (FTS5) via `better-sqlite3` for indexing/search
- **State**: Zustand
- **File watching**: chokidar
- **Hotkeys**: `react-hotkeys-hook` + Electron `globalShortcut`
- **Build**: electron-vite (Vite under the hood)
- **Package**: electron-builder (NSIS for Windows)
- **Lint/Format**: Biome
- **Test**: Vitest

## Setup (first time, after clone)

```
npm run setup
```

This single command handles everything:
1. `npm install --ignore-scripts` — downloads all packages without triggering native builds
2. Downloads the Electron binary
3. Rebuilds `better-sqlite3` against Electron's Node ABI (not system Node)

This works on **any Node version** (20, 22, 24+) and any platform (Windows, macOS, Linux) without needing Python or a C++ compiler.

## Build & Run

- `npm run dev` — start the dev environment (electron-vite with HMR)
- `npm run build` — build to `out/`
- `npm run package` — build + electron-builder `--dir` (unpacked output for inspection)
- `npm run dist` — build + electron-builder (installer in `release/`)
- `npm run dist:win` — Windows only (NSIS)
- `npm run dist:mac` — macOS only (DMG)
- `npm run dist:linux` — Linux only (AppImage)

### Manual native rebuild

If you need to re-rebuild native modules (e.g. after an Electron upgrade):

```
npm run rebuild
```

## Test

- `npm run test` — Vitest, one shot
- `npm run test:watch` — Vitest watch mode

> Tests run Vitest **under Electron's Node runtime** via `scripts/run-vitest-electron.mjs` (`ELECTRON_RUN_AS_NODE=1`). This is required because the rebuilt `better-sqlite3` is an Electron-ABI binary that won't load under the system Node — the index/search tests would fail at module load otherwise. Don't invoke `vitest` directly; use the npm scripts.

## Lint & Format

- `npm run lint` — Biome lint
- `npm run format` — Biome format (writes)
- `npm run check` — Biome lint + format combined (writes safe fixes)

## Typecheck

- `npm run typecheck` — both projects (node + web)
- `npm run typecheck:node` — main + preload + shared
- `npm run typecheck:web` — renderer + shared

## Project Structure

```
src/
├── main/           # Electron main process — services, windows, IPC handlers
│   ├── index.ts
│   ├── services/   # VaultService, IndexService, SearchService, etc.
│   ├── windows/    # WindowManager, ShortcutManager
│   └── ipc/        # ipcMain handler registration
├── preload/        # contextBridge — exposes typed window.api
├── renderer/       # React UI + Zustand stores + CodeMirror editor
│   ├── components/
│   ├── stores/
│   ├── editor/     # CodeMirror 6 setup
│   └── api/        # window.api wrapper (typed IPC client)
└── shared/         # Types shared across processes (IPC contract, domain types)
```

## Conventions

- **Renderer never imports Node APIs.** All system access goes through `window.api` (typed IPC).
- **Main services don't import React/Zustand.** Pure TypeScript modules.
- **Shared package contains types only**, no runtime code.
- **Source of truth**: files on disk. SQLite is a derived, rebuildable index.
- **Locked notes (planned, E10)**: notes the user explicitly locks are encrypted at rest (scrypt + AES-256-GCM via Node `crypto`, single vault password held only in main-process memory). Locked notes are **excluded from the FTS index** — leaving one in the plaintext index leaks its contents. No password recovery by design.
- **Functional-leaning TS.** Classes only for main-process services owning stateful resources (DB connection, watcher).
- **Errors**: throw at service layer; catch at IPC boundary; deliver `IpcResult<T>` to renderer.
