# Tech Stack: Slate

> **Status**: Decided
> **Created**: 2026-05-18
> **Skill**: /project-techstack
> **Vision**: PROJECT-VISION.md

## Overview

Slate is an Electron desktop application written in TypeScript, with a React + Tailwind UI and CodeMirror 6 as the editor core. Notes are stored as plain markdown files on disk; a local SQLite database (FTS5) provides full-text search and indexed metadata. The dependency philosophy is balanced — we lean on proven libraries (CodeMirror, SQLite, React) where building from scratch would cost weeks, while avoiding kitchen-sink frameworks and any plugin/extension surface.

## Language

**TypeScript** (latest stable)
A multi-window Electron app with editor state, tab state, file I/O, IPC, search, and settings benefits significantly from compile-time type safety. The cost of TS over plain JS is negligible in tooling effort.
Considered: plain JavaScript — rejected; the IPC contract surface alone makes types worth it.

## Runtime

**Electron** (latest stable)
Closest existing analog (Obsidian) is Electron-based. Provides identical Chromium rendering on every OS, mature JS-all-the-way ecosystem, and well-trodden patterns for global shortcuts, file watching, and OS integration. Footprint cost (~150MB install, ~200MB RAM) is acceptable for a single-user personal tool.
Considered: Tauri 2 — rejected for this project. Tauri's main wins (small bundle, low RAM) matter little for personal/local use, and its WebView inconsistency across OSes plus the Rust seam add learning tax that conflicts with the "lean effort" goal.

## UI Framework

**React** (latest stable)
Largest ecosystem for the routine UI shell (tabs, sidebars, command palettes, resizable panes, file trees). TypeScript-first. Maximizes off-the-shelf solutions, which serves the "lean effort" goal even if it adds some bundle weight.
Considered: Svelte 5 (more elegant, smaller bundles, smaller ecosystem of pre-built components — net slower to build), no framework (Obsidian's path — significantly more code for routine UI, only worthwhile when targeting a commercial-grade footprint).

## Editor

**CodeMirror 6**
The single highest-risk choice in the stack. CM6 is what Obsidian uses for the exact same problem (markdown notes with first-class code blocks). Strong code-block story via built-in language packs; live-preview markdown achievable via decorations. Framework-agnostic, MIT-licensed, actively maintained.
Considered:
- Milkdown — gives WYSIWYG markdown out of the box but code blocks are not first-class; weaker fit for code-heavy notes.
- TipTap — popular, but the notes-app ecosystem (e.g., OpenNotas) is shifting away from it toward Milkdown.
- Lexical — pre-1.0; known decoration-model limitations; not mature enough yet.

## Data Layer

**Markdown files on disk** (source of truth) + **SQLite with FTS5** (derived index)
Notes are plain `.md` files in a user-chosen "vault" folder — portable, future-proof, survives Slate going away. A local SQLite database (via `better-sqlite3`) indexes content for full-text search and stores metadata (tags, recents, pins) without polluting the markdown.
Considered: pure-JS search libraries (MiniSearch, Flexsearch) — viable for small libraries but slower at scale, and SQLite's SQL surface is valuable for compound queries (tag + folder + recency).

## Desktop sticky notes (optional pinned windows)

**Electron's own multi-window APIs. Zero new dependencies.**

A sticky note is an additional frameless `BrowserWindow` (`frame: false`, `alwaysOnTop: true`, `setVisibleOnAllWorkspaces(true)`), rendering one vault note through the same renderer bundle via a route hash (the pattern the quick-capture window already uses). Position/size and the stuck-note set persist in `SettingsService` and restore on launch.

Considered and rejected:
- **Desktop-embedded / wallpaper-level widgets** (behind app windows, Rainmeter-style) — needs native Win32 `SetParent` into the `WorkerW`/`Progman` desktop layer and unsupported macOS window-level hacks. That means a native addon and per-OS fragility across OS updates — the opposite of the cross-platform, low-dependency goal. Sticky notes float *above* apps instead.
- **A dedicated widget/overlay framework** — unnecessary; Electron windows already do everything the floating model needs.

## Encryption (optional per-note locking)

**Node's built-in `crypto` — `scrypt` (KDF) + `AES-256-GCM` (cipher). Zero new dependencies.**

Locked notes are encrypted at rest: the vault password is stretched with `scryptSync` (per-note random salt) into a 256-bit key, and the content is sealed with `AES-256-GCM` (per-note random nonce, built-in authentication tag). The password lives only in main-process memory for the session — never written to disk, never sent to the renderer (encrypt/decrypt happen in main; only plaintext or ciphertext crosses IPC).

Considered and rejected:
- **Argon2id** (`argon2` / `@node-rs/argon2`) — marginally stronger KDF, but it's a **native module**. Slate already pays a native-module tax with `better-sqlite3` (Electron ABI rebuilds, CI matrix pain visible in the build history). A second native dependency compounds packaging fragility for a benefit that is negligible for a single-user local app. `scrypt` is memory-hard, built into Node, and more than sufficient here.
- **libsodium / `tweetnacl`** — capable, but again an extra dependency for what Node's `crypto` already does natively.
- **OS keychain as the key store** — rejected at the vision level: no key escrow, no "remember on device". The password is the only key material and it stays in the user's head.

## Key Libraries

| Library | Purpose | Rationale |
|---|---|---|
| `electron` | Desktop runtime | Decided above |
| `react` + `react-dom` | UI | Decided above |
| `@codemirror/*` | Editor | Decided above |
| `better-sqlite3` | SQLite bindings | Synchronous API, fast, the standard Node SQLite binding |
| `chokidar` | File watching | Reliable cross-platform fs watcher; standard for Electron |
| `zustand` | State management | Minimal boilerplate, TS-first, no Context boilerplate; Redux is overkill |
| `tailwindcss` (v4) | Styling | Fast iteration, huge utility ecosystem, no CSS-naming churn |
| `lucide-react` | Icons | Same icon set as Obsidian; clean and MIT-licensed |
| `react-hotkeys-hook` | In-app hotkeys | Lightweight, idiomatic React API for keyboard shortcuts |
| `react-resizable-panels` | Split panes | Lightweight, common choice for editor-shell layouts |

(Electron's `globalShortcut` API handles the OS-level quick-capture hotkey — no extra dependency.)

## Tooling

| Tool | Role | Notes |
|---|---|---|
| `vite` (via `electron-vite`) | Bundler / dev server | Modern default; instant HMR; clean Electron integration |
| `electron-builder` | Packaging / installers | Most mature path for producing Windows installers (and Mac/Linux later if ever needed) |
| `vitest` | Unit tests | Vite-native, Jest-compatible API |
| `biome` | Lint + format | One tool replaces ESLint + Prettier; faster; less config |

E2E testing (Playwright) is deferred — for a personal app, manual testing is sufficient.

## Dependency Philosophy

**Balanced.** Pull in well-known libraries for capabilities that would cost weeks to build (editor, search, file watching, styling). Avoid frameworks-of-frameworks (no Next.js, no Remix), no plugin system, no kitchen-sink UI libraries. One dependency per real need; reject the rest.

## Risks & Watch Items

- **CodeMirror 6 WYSIWYG live-preview**: this is the part of the stack with the most custom integration work. The pattern is well-established (Obsidian, others) but Slate-specific decoration setup is non-trivial. Mitigation: study Obsidian's open-source plugin examples; CM6 has solid docs.
- **`better-sqlite3` native module**: requires rebuilding for Electron's Node ABI. `electron-builder` handles this but it's an occasional source of pain on upgrades. Mitigation: pin Electron and `better-sqlite3` versions together; rebuild via `electron-rebuild` if needed.
- **Tailwind v4**: relatively new major version; minor ecosystem churn possible. Acceptable risk for greenfield project.
- **Biome maturity**: very capable in 2026 but smaller ecosystem of custom rules than ESLint. If a specific lint rule is missing, swap-out cost to ESLint+Prettier is modest.
- **Encryption correctness & data loss**: a bug in the encrypt/decrypt path (wrong nonce handling, truncated tag, format version drift) or a forgotten password both mean unrecoverable content — there is no recovery by design. Mitigation: keep the crypto path tiny and standard (`scrypt` + `AES-256-GCM`, no custom scheme), version the on-disk format header from day one, and cover round-trip + tamper-detection + wrong-password cases with tests before the feature ships.
