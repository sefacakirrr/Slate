# Epic 11: Desktop Sticky Notes

> **Status**: Planning
> **Created**: 2026-07-01
> **Baseline**: `45f1cf0` (revert point if epic is abandoned)
> **Skill**: /epic-create
> **Vision revision**: PROJECT-VISION.md 2026-07-01 (optional desktop sticky notes added to scope)

---

## 1. Summary

**Problem**: Some notes (todos, a reference snippet, a running scratchpad) are more useful kept in view than filed away. Today every Slate note lives inside the single main window — to glance at one you must switch to the app and open it.

**Vision**: The user pins selected notes as small, **frameless, always-on-top windows** that float above other apps (the OS "sticky notes" model). A sticky is a live editor on a vault `.md` file — edits save straight to disk. Which notes are stuck and where each window sits persist and restore on the next launch. Cross-platform via Electron's own window APIs, no native code.

**Key Deliverables**:
1. `WindowManager` sticky lifecycle — `openSticky` / `closeSticky` / `restoreStickies`, one frameless always-on-top `BrowserWindow` per pinned note.
2. A `#/sticky/<path>` renderer route + `StickyNote` view with a reused CodeMirror editor that saves to the vault file.
3. Persistence: the stuck set + each window's geometry in `SettingsService`, restored on launch, saved on move/resize/quit.
4. Pin/unpin UI in the main window (sidebar), locked notes excluded.

---

## 2. Exploration Findings

> Codebase exploration performed 2026-07-01 via /epic-create (Explore agent).

### Relevant Components
- **WindowManager** (`src/main/windows/WindowManager.ts`): `createMainWindow` (15–61) and **`openQuickCapture`/`closeQuickCapture` (63–107) are the exact template** — frameless (`frame:false`), `alwaysOnTop:true`, `skipTaskbar:true`, same preload (`../preload/index.js`), loaded via `ELECTRON_RENDERER_URL + '#/capture'` (dev) or `loadFile(..., { hash })` (packaged). Quick-capture auto-closes on blur; a sticky must NOT.
- **Renderer routing** (`src/renderer/App.tsx` 18–23): `window.location.hash === '#/capture'` picks the view. All windows load the same bundle (`index.html` + `main.tsx`); the hash is the only differentiator. A `#/sticky/<encoded path>` branch is the extension point.
- **Preload** (`src/preload/index.ts`): a single `contextBridge` `window.api` is shared by every window — stickies already get full `vault.*` + `window.*` access; we add a small sticky namespace (report geometry, close).
- **SettingsService** (`src/main/services/SettingsService.ts`): `WorkspaceData` + `getWorkspace`/`setWorkspace` (lazy load, atomic temp+rename, graceful defaults) is the persistence model to mirror for `stickies`.
- **Editor core** (`src/renderer/editor/`, `EditorHost.tsx`): `createTabState({ path, doc, onDocChange, onSave })` is decoupled from the store; `EditorHost` is only the wrapper that binds it to `workspaceStore`. A sticky can mount the editor directly with its own callbacks.
- **Cross-window event** (`vault:filesChanged`): emitted only to the main window today (`handlers.ts` `capture:save` ~256); subscribed in `App.tsx` (95–99) to refresh the file list.
- **Encryption** (`encryptionStore.isLockedPath`, `handlers.ts vault:readNote` throws `note-locked`): locked notes are already gated; stickies exclude them in v1.

### Current Implementation
Multi-window infra exists and is proven (main + quick-capture). No sticky concept yet. No per-open-note reload on external change (only the file *list* refreshes).

### Gaps Identified
- No sticky window type, no `#/sticky` route, no `stickies` persistence.
- `vault:filesChanged` reaches only the main window; with more windows it must broadcast to all (for file-list freshness).
- `workspaceStore` persists open tabs to the shared `settings.json` — a sticky must NOT reuse it or it clobbers the main window's tabs.

### Patterns to Follow
- Quick-capture window creation + hash routing + shared preload.
- `SettingsService` typed accessors (`getStickies`/`setStickies`) with atomic persist.
- Reuse the CM6 editor core via `createTabState`; service-as-class in main.

---

## 3. Architecture

### Store isolation (the defining constraint)
Each window is a separate renderer process with its **own** Zustand store — no shared state. A sticky therefore gets a dedicated lightweight **`stickyStore`** (single note: `path`, `content`, `draft`, `dirty`, `save`, `reload`) and mounts the CM6 editor directly via `createTabState`. It deliberately does **not** use `workspaceStore`, whose `persistWorkspace` writes the open-tab set to the shared `settings.json` and would overwrite the main window's tabs.

### Windows / lifecycle (main process)
```
WindowManager
 ├─ main window            (existing)
 ├─ quick-capture window   (existing)
 └─ stickies: Map<path, BrowserWindow>   (new)
      openSticky(path, bounds?)  → frameless, alwaysOnTop, skipTaskbar, resizable,
                                    loadURL/​loadFile '#/sticky/<encodeURIComponent(path)>'
      closeSticky(path)          → destroy + drop from map + settings
      restoreStickies()          → on launch, re-open each persisted sticky at its bounds
      move/resize (debounced)    → settings.updateStickyGeometry(path, bounds)
```

### Persistence (SettingsService)
`stickies: { path: string; bounds: {x,y,width,height} }[]` — mirrors `WorkspaceData`. Saved debounced on move/resize and on `will-quit`; read by `restoreStickies()` after `createMainWindow()` in `main/index.ts`.

### Sync model (near-live, on-save reload — expanded in Phase 03)
The vault `.md` file is the single source of truth. A sticky saves through the normal `vault:writeNote`; `vault:filesChanged` is broadcast to **all** windows so every file *list* stays fresh. **Phase 03 adds content sync**: a `vault:noteChanged{path}` event fires on a content write; any window showing that note reloads its editor from disk **only if it isn't dirty** (a dirty window keeps its edits — last-write-wins on the next save, never a silent clobber). Stickies also get debounced autosave so typing propagates without a manual save. This is "reflects on save / shortly after typing," not per-keystroke streaming.

---

## 4. Success Criteria

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | Pinning a note opens a frameless, always-on-top window showing that note's content, editable | Pin a note; the sticky floats above other apps and shows the text |
| 2 | Editing in a sticky saves to the vault `.md` file | Edit in sticky; open the same file in the main window / on disk → changes present |
| 3 | Closing and relaunching the app restores each sticky at its previous position and size | Move/resize a sticky, quit, relaunch → sticky returns to the same spot |
| 4 | Unpinning (closing) a sticky removes it from the persisted set | Close a sticky, relaunch → it does not reappear |
| 5 | Locked (`.md.enc`) notes cannot be pinned as stickies (v1) | Pin action absent/blocked on a locked note |
| 6 | Works on macOS and Windows | Manual run on both; floating + persistence behave |
| 7 | A note deleted while its sticky is open closes the sticky gracefully (no crash) | Delete a stuck note from the main window → its sticky closes |

---

## 5. Scope

### In Scope
- `WindowManager` sticky lifecycle (`openSticky`/`closeSticky`/`restoreStickies` + geometry tracking).
- `#/sticky/<path>` route + `StickyNote` component + `stickyStore` + direct CM6 editor mount + save-to-file.
- `SettingsService` `stickies` (path + bounds) persistence; restore on launch; save on move/resize/quit.
- IPC: `window:sticky:open` / `close` / `reportGeometry` (+ preload mirror).
- Pin/unpin affordance in the main window sidebar (icon on a note row), locked notes excluded.
- Broadcast `vault:filesChanged` to all windows so file lists stay fresh.
- Graceful handling when a stuck note is deleted or becomes locked elsewhere (close the sticky).
- Cross-platform (macOS + Windows) manual verification.
- **Near-live multi-window content sync** *(added 2026-07-01, Phase 03)* — a note saved in one window reloads in any other window showing it, when that other window isn't dirty; the sticky gets debounced autosave so edits propagate without a manual save. Both directions (sticky↔main). Includes the main-window "reload an open tab on external change" behavior, which didn't exist before.

### Out of Scope
- **Per-keystroke live collaboration** (CRDT/operational-transform streaming between windows) — overkill for a single-user local app; the on-save/autosave reload above covers the real need.
- **Autosave in the main window** — the main editor keeps its manual-save (Ctrl+S) + dirty-guard model; only stickies autosave. Main→sticky propagation happens on the main window's save.
- **Locked notes as stickies** — excluded in v1 (a floating window can't sit behind a password prompt cleanly). Possible later.
- **Desktop-embedded / wallpaper-level widgets** — rejected at vision level (native Win32/macOS hacks).
- **Sticky customization** (per-note color, opacity, font size, pin-on-top toggle) — not v1.
- **Rename of a stuck note reflected live in its sticky** — v1 treats a rename like a delete (sticky closes); re-pin under the new name.

---

## 6. Risks & Open Questions

| Risk | Impact | Mitigation |
|------|--------|------------|
| Renderer store isolation misunderstood → sticky reuses `workspaceStore` and clobbers the main window's persisted tabs | Corrupted tab restore in the main window | Dedicated `stickyStore`; sticky never calls `workspaceStore`/`persistWorkspace`. Called out explicitly in the plan. |
| Geometry saved on every move/resize event | Excessive disk I/O (settings.json rewritten constantly) | Debounce (~500ms, like the watcher) + a final save on `will-quit`. |
| macOS vs Windows lifecycle asymmetry | On Windows, closing the main window quits the app (`window-all-closed`), taking stickies with it; on macOS the app + stickies stay alive | Accept for v1 and document it; persistence means stickies return on next launch either way. Revisit "stickies keep app alive on Windows" only if requested. |
| A stuck note is deleted / renamed / locked from another window while its sticky is open | Sticky editing a nonexistent or now-encrypted file → save errors | On `vault:filesChanged`, a sticky checks its file still exists and is unlocked; if not, it closes gracefully. |
| Same note edited in two windows at once | Last-write-wins can silently drop one side's edits | Chosen limitation for v1 (documented in §3). The realistic use — a sticky for a note you're *not* also editing in main — rarely hits it. |
| Dev vs packaged URL/hash loading for a path with slashes | Sticky fails to load the right note | `encodeURIComponent(path)` in the hash; same dev/packaged branch as quick-capture. |

---

## 7. Design Inputs

- **Project design handover**: none (`.claude/DESIGN-HANDOVER.md` absent).
- **Design status**: informal — UI is modest (a sticky = minimal drag header + close button + the existing editor; a pin icon on sidebar rows, mirroring the E10 lock icon). Follows established patterns.
- **Design review**: not run; low risk. Flag if the sticky chrome grows beyond a header + editor.
- **Visual verification**: sticky is frameless, floats above other apps, is draggable (custom drag region since frameless), editor fills the window; pin icon reads clearly on note rows.
- **Deferred UI decisions**: sticky color/customization (out of scope); exact pin-icon placement finalized in /epic-plan.
