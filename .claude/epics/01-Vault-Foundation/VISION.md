# Epic 01: Vault Foundation

> **Status**: Planning
> **Created**: 2026-05-18

---

## 1. Summary

**Problem**: The scaffold has zero file I/O wiring. Nothing reads, writes, lists, or persists anything. Without a working vault layer and a typed IPC contract between main and renderer, no other epic can start — every M1/M2 deliverable depends on it.

**Vision**: A read + create + delete vault wired end-to-end. The user picks a folder; the sidebar lists the markdown/text files in it; clicking shows raw content; "New Note" creates an empty file; right-click → Delete removes one. The vault path persists across launches. No editor, no live external-change detection — those come in E2.

**Key Deliverables**:
1. **IPC contract foundation** — typed `shared/ipc.ts` covering `settings:*` and `vault:*` commands, used end-to-end through preload `contextBridge`
2. **SettingsService** (main) — persists the vault path to `userData/settings.json`
3. **VaultService** (main) — `listNotes`, `readNote`, `writeNote`, `createNote`, `deleteNote` with atomic writes and path-safety checks
4. **Renderer shell** — sidebar with recursive file tree, read-only content pane, vault folder picker UX, `vaultStore` (Zustand), New/Delete actions, manual refresh

---

## 2. Exploration Findings

> Codebase reviewed 2026-05-18 by /epic-create. The codebase was scaffolded earlier the same day — there is essentially nothing pre-existing to discover. Documenting baseline state for traceability.

### Relevant Components (current state — all stubs)

- **`src/main/index.ts`** — Bare `BrowserWindow` creator. Loads renderer; no service wiring; no IPC handler registration.
- **`src/preload/index.ts`** — `contextBridge.exposeInMainWorld('api', {})` with empty `api` object. Type alias `Api` exported but unused.
- **`src/shared/ipc.ts`** — Only `IpcResult<T>` discriminated union exists. No command or event types.
- **`src/shared/types.ts`** — Empty placeholder (`export {}`).
- **`src/renderer/App.tsx`** — Centered "Slate — scaffolded." text. No layout, no state, no IPC consumer.
- **`src/renderer/stores/`, `services/`, `windows/`, `ipc/`, `components/`, `editor/`, `api/`** — All empty (`.gitkeep` only).

### Current Implementation

There is no current implementation of vault, settings, or IPC handling. This epic builds the first vertical slice.

### Gaps Identified

Everything needed for the acceptance test is a gap:
- No way to persist the vault path
- No way to enumerate or read files
- No way to write or create files
- No IPC channel between main and renderer beyond `IpcResult<T>`'s type definition
- No UI beyond a placeholder string

### Patterns to Follow (from ARCHITECTURE.md)

- **Main never imports React/Zustand.** Services are pure TS modules.
- **Renderer never imports Node APIs.** All system access via `window.api`.
- **Shared package: types only.** No runtime code.
- **Errors**: throw at service layer; catch at IPC boundary; deliver `IpcResult<T>` to renderer.
- **Services as classes only when owning stateful resources** — `SettingsService` (file handle / JSON cache) and `VaultService` (vault root path) both qualify.

---

## 3. Architecture

### Current State

```
src/main/index.ts ──── createWindow() ──── loads ──── src/renderer/App.tsx ("Slate — scaffolded.")
                                                              │
                                                              └── empty stores, no state, no IPC
```

### Target State (end of E01)

```
┌──────────────────────── MAIN PROCESS ─────────────────────────┐
│                                                                │
│  src/main/index.ts                                             │
│    ├─ services/SettingsService.ts ── settings.json (userData)  │
│    ├─ services/VaultService.ts                                 │
│    │    ├─ listNotes()      → string[] (relative paths)        │
│    │    ├─ readNote(path)   → string                           │
│    │    ├─ writeNote(p, c)  → void  (atomic temp-rename)       │
│    │    ├─ createNote(path) → void  (empty file)               │
│    │    └─ deleteNote(path) → void                             │
│    └─ ipc/handlers.ts ── registers ipcMain.handle('settings:*',│
│                                                'vault:*', ...) │
└──────────────────────────┬─────────────────────────────────────┘
                           │ typed IPC (IpcResult<T>)
                           │
┌──────────────────────────▼─────────────────────────────────────┐
│                       PRELOAD                                  │
│  src/preload/index.ts ── contextBridge.exposeInMainWorld(      │
│                            'api', { settings, vault }          │
│                          ) — typed via shared/ipc.ts           │
└──────────────────────────┬─────────────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────────────┐
│                     RENDERER PROCESS                           │
│                                                                │
│  src/renderer/api/index.ts  ── thin typed wrapper over         │
│                                window.api                      │
│                                                                │
│  src/renderer/stores/vaultStore.ts                             │
│    state: { vaultPath, fileList, selectedPath }                │
│    actions: pickVault(), refresh(), select(path),              │
│             createNote(), deleteNote(path)                     │
│                                                                │
│  src/renderer/components/                                      │
│    ├─ EmptyState.tsx    — first-launch "pick folder" view      │
│    ├─ Sidebar.tsx       — file tree (recursive)                │
│    ├─ ContentPane.tsx   — read-only raw text display           │
│    └─ ConfirmDialog.tsx — delete confirmation                  │
└────────────────────────────────────────────────────────────────┘
```

### IPC Contract (v1, this epic's surface)

```ts
// shared/ipc.ts (additions)

export type SettingsCommands = {
  'settings:getVaultPath': { request: void;        response: string | null }
  'settings:setVaultPath': { request: string;      response: void }
}

export type VaultCommands = {
  'vault:listNotes':       { request: void;        response: string[] }   // relative paths
  'vault:readNote':        { request: string;      response: string }     // file content
  'vault:writeNote':       { request: { path: string; content: string }; response: void }
  'vault:createNote':      { request: string;      response: void }       // path of new empty file
  'vault:deleteNote':      { request: string;      response: void }
}

export type IpcCommands = SettingsCommands & VaultCommands
```

Every response on the renderer side arrives as `IpcResult<T>` — handlers wrap their service calls in try/catch.

### Vault Filtering Rules

- Listed extensions: `.md`, `.markdown`, `.txt`
- Excluded: any file or folder whose name starts with `_` (e.g., `_attachments/`) or `.` (e.g., `.git/`, `.DS_Store`)
- Recursive: subfolders walked depth-first; folder ordering not guaranteed in v1 (alphabetical sort comes later if needed)

### Path Safety

`VaultService` resolves every input path relative to the configured vault root and rejects any resolved path that escapes the root (`../` traversal). Implementation: `path.resolve(vaultRoot, p).startsWith(vaultRoot + sep)`.

### Atomic Write

`writeNote` writes to `<path>.tmp-<random>`, `fsync`s, then renames into place. Crash-safe — a partially-written `.tmp-*` file may be left behind but the canonical file is never half-written. Cleanup of stray `.tmp-*` files deferred to a later epic.

---

## 4. Success Criteria

| # | Criterion | Verification |
|---|---|---|
| 1 | Fresh launch with no settings shows an empty-state "Choose vault folder" view | Manual: delete `userData/settings.json`, launch `npm run dev`, see button |
| 2 | Folder picker opens, the chosen path is persisted | Manual: pick folder, restart app, vault auto-loads |
| 3 | Sidebar tree lists `.md`/`.markdown`/`.txt` files recursively, hides `_*` and `.*` | Manual: pre-populate test vault with mixed files; verify visible/hidden set |
| 4 | Click a file → raw content appears in content pane | Manual: place a note with known content; click; verify pane shows it byte-for-byte |
| 5 | "New Note" creates an empty file in vault root; it appears in the tree and becomes selected | Manual: click, observe tree + filesystem |
| 6 | Right-click → Delete (with confirm) removes the file from tree and disk | Manual: click delete, confirm, verify file is gone from disk |
| 7 | Path-safety: writing/reading a path containing `..` is rejected with `IpcResult.error` | Unit test on VaultService |
| 8 | Atomic write: a forced crash mid-write leaves the canonical file intact (old version) | Unit test on VaultService (simulate crash via thrown error mid-write) |
| 9 | Lint + typecheck + build all green; no console errors at runtime | `npm run check && npm run typecheck && npm run build` |

---

## 5. Scope

### In Scope

- IPC contract foundation (`shared/ipc.ts`) — settings + vault commands
- Preload `contextBridge` exposing a typed `window.api`
- `SettingsService` — vault path persistence to `userData/settings.json`
- `VaultService` — list / read / write / create / delete with atomic writes and path safety
- Renderer: `EmptyState`, `Sidebar` (recursive tree), `ContentPane` (read-only), `ConfirmDialog`
- `vaultStore` (Zustand) — file list, selected path, vault path, refresh
- Renderer `window.api` typed client wrapper
- "New Note" and "Delete Note" UI actions
- Manual "refresh tree" button
- Unit tests for `VaultService` (path safety, atomic write, listing filter rules)

### Out of Scope (deferred)

- **chokidar watcher / live external-change detection** — E02 (where editor saves create the coordination need)
- **CodeMirror 6 / any text editing** — E02
- **Save on edit / dirty tracking** — E02 (no editing happens in E01)
- **File rename / move** — later epic; not needed for E01 acceptance
- **Folder create / rename / delete** — later epic; E01 only renders existing folders
- **Tabs, tags, search, attachments, hotkeys, dark mode, settings UI beyond the picker** — separate epics
- **Stray `.tmp-*` cleanup** — accept residue from interrupted writes; sweep added later
- **Sort/order controls in the sidebar** — defer; default is filesystem order

---

## 6. Risks & Open Questions

| Risk / Question | Impact | Mitigation |
|---|---|---|
| First epic to touch every layer; IPC contract shape locks in conventions for every later epic | Refactor cost if the shape is wrong | Keep the v1 contract small (the 7 commands above); accept that E02 will refactor when adding write-with-watcher coordination |
| Atomic-write implementation on Windows can have edge cases (rename-over-existing requires extra care vs POSIX) | Data corruption on edge cases | Use Node `fs.promises.rename` (which on Windows uses `MoveFileEx` with `MOVEFILE_REPLACE_EXISTING` semantics in modern Node); add a unit test for overwrite |
| `vault:listNotes` returning a flat list of paths may not scale to deeply nested or huge vaults | Sidebar render performance on large vaults | Acceptable for v1 — single-user personal use; if it becomes a problem, switch to paged or lazy-loaded listing later. Not premature work for E01 |
| Path safety check has to be platform-aware (Windows path separators and drive letters) | Security regression | Use Node `path.resolve` which normalizes; check resolved path starts with `resolvedVaultRoot + path.sep`; cover with unit tests on Windows path inputs |
| No watcher means external file changes won't show in tree until manual refresh | Confusing UX if user edits outside Slate | Acceptable for E01; the manual "refresh" button is the escape hatch. E02 brings the watcher. |
| `.txt` files in scope but no editor in this epic | Trivial — read-only viewer treats all three extensions identically | None needed for E01; E02 must branch its language mode by extension |

---

## 7. Notes for /epic-plan

The phase structure when this epic is planned should approximately follow this order (so each phase is independently testable and the integration risk surfaces early):

1. **Phase 01 — IPC contract + preload bridge.** Define the contract; wire empty handlers in main; expose `window.api`; round-trip a noop call from renderer.
2. **Phase 02 — SettingsService + first-launch UX.** Persist vault path; render empty state vs vault-loaded state.
3. **Phase 03 — VaultService read paths.** `listNotes`, `readNote`, path safety; sidebar + content pane wired.
4. **Phase 04 — VaultService write paths.** `writeNote`, `createNote`, `deleteNote`, atomic write, "New Note" + "Delete" UI actions.
5. **Phase 05 — Unit tests + polish.** Vitest coverage on `VaultService`; manual acceptance run-through.

`/epic-plan` decides the actual phase split — this is a suggestion, not a contract.
