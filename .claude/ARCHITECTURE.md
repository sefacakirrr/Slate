# Architecture: Slate

> **Status**: Designed
> **Created**: 2026-05-18
> **Skill**: /project-architecture
> **Inputs**: PROJECT-VISION.md, TECHSTACK.md

## Overview

Slate is a process-separated, service-oriented Electron application. The **main process** owns all system resources (filesystem, SQLite, global shortcuts, window lifecycle, the chokidar watcher) and exposes them to the renderer through a typed IPC contract. The **renderer process** is a React + Tailwind UI with Zustand stores and an encapsulated CodeMirror 6 editor module. Markdown files on disk are the source of truth; SQLite is a derived, rebuildable index. The architecture is deliberately simple — no plugin system, no extension points, no abstract layers beyond what the vision concretely demands.

## Architectural Pattern

**Process-separated, service-oriented layered architecture.**

- The Electron process boundary is the primary architectural seam — it's a hard barrier the runtime imposes, and we lean into it instead of fighting it.
- Within the main process, concerns are split into small **services**, each owning one stateful resource (`VaultService` owns file I/O and the watcher; `IndexService` owns the SQLite connection; etc.).
- The renderer is a conventional layered SPA: components → stores → IPC client.

**Why this pattern:**
- Electron forces a process split; pretending otherwise (e.g., misusing `nodeIntegration`) creates security and stability problems.
- Service-orientation in main keeps each system concern isolated and independently testable.
- Layered renderer keeps the UI thin and lets state and side-effects live in well-known places.

**Considered and rejected:**
- *Single-process via `nodeIntegration: true`* — easier in the short term but exposes Node APIs to renderer JS (and to any embedded markdown/HTML), which is a security liability even for a personal app. Hard no.
- *Event-driven / message-bus architecture* (heavier than IPC events) — overkill for the modest concurrency and decoupling needs here. The hybrid IPC (RPC + events) already handles both call/response and push without a generic bus.
- *Clean Architecture / Hexagonal with explicit ports & adapters* — useful for large, long-lived systems with many delivery mechanisms. Slate has one delivery mechanism (the renderer) and one persistence path (vault + SQLite); the ceremony would be pure overhead.

## Components

### Main process

#### VaultService
- **Responsibility**: All filesystem I/O against the vault folder. Atomic writes (write-temp-then-rename). Path safety and sanitization. Owns the chokidar watcher and debounces watcher events. Emits change events to the IPC layer.
- **Depends on**: Node `fs/promises`, `chokidar`, `SettingsService` (for vault path)
- **Exposes**: `listNotes()`, `readNote(path)`, `writeNote(path, content)`, `createNote(path)`, `deleteNote(path)`, `moveNote(src, dst)`, `subscribeToChanges(handler)`
- **Key patterns**: Repository pattern (abstracts file I/O), Observer (watcher event emission)

#### IndexService
- **Responsibility**: SQLite schema and connection. Incremental indexing of notes. Reconciliation scan at launch. Manual full rebuild on demand.
- **Depends on**: `better-sqlite3`, `VaultService` (to read notes for indexing)
- **Exposes**: `indexNote(path, content)`, `removeNote(path)`, `reconcile()`, `rebuild()`
- **Key patterns**: Repository pattern (DB access), Transaction (atomic per-file updates)

#### SearchService
- **Responsibility**: FTS5 queries over the index. Ranked result assembly with snippets/highlights. Tag/folder/recency filters.
- **Depends on**: `IndexService` (for SQLite connection)
- **Exposes**: `search(query, filters)`, `recent(limit)`, `byTag(tag)`
- **Key patterns**: Query Object (filter composition)

#### SettingsService
- **Responsibility**: Persist user preferences (vault path, theme, hotkey binding, highlight palette). Stored as JSON in Electron's `userData` directory.
- **Depends on**: Node `fs`, `app.getPath('userData')`
- **Exposes**: `get(key)`, `set(key, value)`, `getAll()`, `subscribe(handler)`

#### AttachmentService
- **Responsibility**: Image/file paste and drag-drop handling. Hash-named storage under `vault/_attachments/`. Cleanup of orphans (deferred — not v1).
- **Depends on**: `VaultService`, Node `crypto` (for hashing)
- **Exposes**: `storeBlob(buffer, ext)`, `getPath(hash)`

#### WindowManager
- **Responsibility**: Main editor window and quick-capture popup window lifecycle. BrowserWindow creation, focus management, dev-tools wiring.
- **Depends on**: Electron `BrowserWindow`, `app`
- **Exposes**: `openMain()`, `openQuickCapture()`, `closeQuickCapture()`

#### ShortcutManager
- **Responsibility**: Register and tear down Electron `globalShortcut` bindings (especially the quick-capture hotkey). Read binding from `SettingsService`.
- **Depends on**: Electron `globalShortcut`, `SettingsService`, `WindowManager`
- **Exposes**: `register()`, `unregister()`, `rebind(accelerator)`

#### IPC handlers
- **Responsibility**: Wire main services to the IPC contract. Each command in `shared/ipc.ts` has exactly one handler. Errors caught here and converted to `IpcResult<T>`.
- **Depends on**: All services above, Electron `ipcMain`
- **Exposes**: nothing — this is the seam between services and the renderer.

### Renderer process

#### React components
Pure UI. No business logic. Read from stores via Zustand hooks, dispatch to stores. Examples (created in later epics — not scaffolded):
- `Sidebar` (folder tree + tags)
- `TabBar` (open notes)
- `EditorHost` (mounts the CodeMirror editor for the active tab)
- `CommandPalette` (Cmd/Ctrl+K)
- `SearchPanel`
- `SettingsModal`

#### Zustand stores
One store per concern; each calls IPC and holds the relevant slice of state:
- `workspaceStore` — open tabs, active tab, dirty flags, save coordination
- `vaultStore` — folder tree, file list (mirrored from main; updated on watcher events)
- `searchStore` — current query, results, filters
- `settingsStore` — user preferences (mirrored from main)

#### Editor module
A self-contained CodeMirror 6 setup: markdown language pack with live-preview decorations, syntax highlighting in code blocks, custom decorations for the fixed highlight-color palette, keymap bindings. Exposes a small surface to the rest of the renderer: mount/unmount, get/set content, dirty signal.

#### IPC client (`window.api`)
A typed wrapper around the `contextBridge`-exposed API. Each store calls `window.api.*` rather than `ipcRenderer.*` directly, keeping IPC details out of stores.

### Shared package

#### `shared/ipc.ts`
The IPC contract: TypeScript types for every command and event signature. Both main and renderer import from it.

#### `shared/types.ts`
Domain types shared between processes: `Note`, `SearchResult`, `Tag`, `Settings`, etc.

## Component Diagram

```
┌──────────────────────────── MAIN PROCESS ────────────────────────────────┐
│                                                                            │
│  WindowManager        ShortcutManager                                      │
│       │                    │                                               │
│       └──── opens ─────────┘                                               │
│                                                                            │
│  ┌─────────────────┐    ┌────────────────┐    ┌─────────────────────────┐│
│  │  VaultService   │ ─→ │ IndexService   │ ←─ │  SearchService          ││
│  │  (fs + watcher) │    │ (SQLite)       │    │  (FTS5 queries)         ││
│  └─────────────────┘    └────────────────┘    └─────────────────────────┘│
│       │                                                                    │
│       │ change events                                                      │
│       ▼                                                                    │
│  ┌──────────────┐  ┌──────────────────┐  ┌─────────────────────────────┐ │
│  │ AttachmentSvc│  │ SettingsService  │  │  IPC handlers (ipcMain)     │ │
│  └──────────────┘  └──────────────────┘  └─────────────────────────────┘ │
│                                                       │                    │
└───────────────────────────────────────────────────────┼───────────────────┘
                                                        │ typed IPC
                                                        │ (commands + events)
┌───────────────────────────────────────────────────────┼───────────────────┐
│                          RENDERER PROCESS             │                    │
│                                                        ▼                    │
│                                          ┌────────────────────────┐        │
│                                          │ window.api (preload    │        │
│                                          │  contextBridge, typed) │        │
│                                          └────────────────────────┘        │
│                                                       ▲                    │
│  ┌──────────────────────────────────────────────────┐ │                    │
│  │  Zustand stores                                  │ │                    │
│  │  workspace · vault · search · settings  ────────────┘                    │
│  └──────────────────────────────────────────────────┘                       │
│           ▲                                                                  │
│           │ subscribe / dispatch                                            │
│           │                                                                  │
│  ┌────────┴────────────┐  ┌─────────────────────┐                          │
│  │ React Components    │  │ Editor module       │                          │
│  │ (sidebar, tabs,     │  │ (CodeMirror 6 +     │                          │
│  │  palette, search…)  │  │  markdown live-     │                          │
│  └─────────────────────┘  │  preview, decorations)                         │
│                            └─────────────────────┘                          │
└────────────────────────────────────────────────────────────────────────────┘
```

## Data Flow

### Read flow (open a note)
1. User clicks a note in the sidebar.
2. `workspaceStore.openTab(path)` is called.
3. Store calls `window.api.readNote(path)` → IPC → `VaultService.readNote()`.
4. Content returns through the IPC boundary as `IpcResult<string>`.
5. Store updates active-tab state; `EditorHost` mounts the editor with that content.

### Write flow (save a note)
1. User edits content; editor emits `change` → `workspaceStore.markDirty()`.
2. Save trigger (Ctrl+S or autosave debounce) → `workspaceStore.save()` → `window.api.writeNote(path, content)`.
3. `VaultService.writeNote()` performs atomic write; signals "ignore next watcher event for this path".
4. After successful write, `IndexService.indexNote()` updates the SQLite row.
5. `workspaceStore.markClean()`.

### External-change flow
1. chokidar emits `change` for a file Slate did NOT just write.
2. `VaultService` debounces 500ms, then calls `IndexService.indexNote()` to reindex.
3. `VaultService` emits a `note-changed` IPC event to all renderer windows.
4. `vaultStore` and `workspaceStore` reconcile: if the changed note is open in a tab, prompt to reload (or auto-reload if not dirty).

### Search flow
1. User types in the search panel; `searchStore.setQuery(q)` (debounced 150ms).
2. Store calls `window.api.search(query, filters)` → `SearchService.search()` → FTS5 query.
3. Results return; `searchStore.results` updates; UI renders.

### Quick-capture flow
1. User presses the global hotkey anywhere on the OS.
2. `ShortcutManager` triggers `WindowManager.openQuickCapture()` — small frameless window mounts a stripped-down editor.
3. User types and saves; the quick-capture window calls `window.api.createNote(path, content)`.
4. The new file lands in the vault → chokidar fires → main window's `vaultStore` picks it up via the watcher event path. (Loose coupling — no special IPC channel between windows.)

## Design Patterns

| Pattern | Where | Problem It Solves |
|---|---|---|
| Repository | `VaultService`, `IndexService` | Centralizes file/DB access so paths, atomicity, schema concerns live in one place |
| Observer | `VaultService` (watcher), `SettingsService` | Multi-window updates without explicit polling |
| Discriminated union (Result) | IPC boundary | Type-safe error propagation across processes without exceptions in renderer |
| Debounce | Watcher events, search input, autosave | Smooths bursts of events into stable signals |
| Context bridge (Electron-idiomatic) | Preload script | Exposes a narrow, typed `window.api` to renderer without `nodeIntegration` |

## Layer Boundaries

**Dependency rules (enforced by convention and TypeScript):**

1. **Renderer code never imports Node APIs.** No `fs`, no `path`, no `electron` (except types). All system access goes through `window.api`.
2. **Main services never import React, Zustand, or any UI library.** They're pure TypeScript modules with no DOM/React assumptions.
3. **Shared package contains only types** (no runtime code that touches the filesystem or DOM). Both sides import from it.
4. **Services in main don't directly call each other's internals** — they go through public method surfaces. `VaultService` does not reach into `IndexService`'s SQLite connection.
5. **Editor module is encapsulated.** CodeMirror state never leaks into Zustand or React props beyond simple primitives (string content, boolean dirty).

## Development Paradigm

**Functional-leaning TypeScript.**

- React components: functional only. No class components.
- Zustand stores: store objects with action methods (Zustand's idiom).
- Main services: classes only when they own a stateful resource (the SQLite connection, the chokidar watcher, the settings file handle). Everything else is a pure function in a module.
- No inheritance hierarchies. No abstract base classes. Composition via plain functions or interface types.

## Error Handling

**Throw at the service layer; catch at the IPC boundary; deliver `IpcResult<T>` to the renderer.**

```ts
type IpcResult<T> = { ok: true; data: T } | { ok: false; error: string }
```

- Services in main throw on unexpected conditions; that's idiomatic JS/TS.
- Each IPC handler wraps its service call in a `try/catch`, returns `IpcResult<T>`.
- Renderer code always destructures `result.ok` before using `result.data` — TypeScript narrows automatically.
- "Should never happen" errors (programmer mistakes, corrupt internal state) are allowed to crash; the user gets a recoverable error overlay rather than a silent failure.

## Extensibility

**Deliberately limited.** The vision is explicit about no plugin system, no extension points, no scripting surface. The architecture supports adding *first-party* features post-MVP (backlinks, daily notes, templates) by:

- Adding new services in main (e.g., a `BacklinkService` reading from `IndexService`)
- Adding new Zustand stores in renderer
- Extending the IPC contract in `shared/ipc.ts`

What we do NOT design for:
- Third-party plugins / scripting
- Multiple persistence backends (only SQLite + fs)
- Multiple UI shells (only React)
- Cross-platform Mac/Linux builds in v1 (Electron supports it if needed later — no architectural change required)
