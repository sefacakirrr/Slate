# Phase 01: Sticky Renderer View

> **Status**: COMPLETE (reviewed 2026-07-01; visual confirmation in P03 UAT)
> **Dependencies**: Phase 00

---

## Goal

A sticky window actually renders and edits its note: the `#/sticky/<path>` route mounts a `StickyNote` view backed by a dedicated `stickyStore`, reusing the CodeMirror editor core, saving edits straight to the vault file.

---

## Tasks

| # | Task | Status | Acceptance Criteria |
|---|------|--------|-------------------|
| 1.1 | `App.tsx`: add a `#/sticky/<encoded path>` branch that decodes the path and renders `<StickyNote notePath={path} />` (before the MainApp fallback) | done | Loading the sticky route renders the sticky view, not MainApp |
| 1.2 | `stickyStore.ts`: single-note state — `path`, `content`, `draft`, `dirty`, `load()` (via `api.vault.readNote`), `save()` (via `api.vault.writeNote`), `setDraft()`. Does NOT touch `workspaceStore` or persist any workspace | done | Store loads a note, tracks dirty, saves to disk; no writes to `settings.workspace` |
| 1.3 | `StickyNote.tsx`: minimal frameless chrome — a draggable title bar (`-webkit-app-region: drag`, buttons `no-drag`) showing the note name + a close button calling `window.api.window.sticky.close(path)` | done | Sticky is draggable by its header; close button closes only that window |
| 1.4 | Mount the CM6 editor directly via the editor core (`createTabState({ path, doc, onDocChange → setDraft, onSave → save })`) — reuse the editor, not the `workspaceStore`-bound `EditorHost` | done | Typing edits the note; Cmd/Ctrl+S saves; content matches the file on disk |
| 1.5 | Save UX: save on Cmd/Ctrl+S and best-effort on window close/blur; apply the current theme (read once via `api.settings.getTheme`) so the sticky isn't unstyled | done | Edits persist without data loss on close; sticky respects dark/light theme |

**Status values**: pending → in_progress → done

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/renderer/App.tsx` | Modify | `#/sticky/<path>` route branch |
| `src/renderer/stores/stickyStore.ts` | Create | single-note state for a sticky window |
| `src/renderer/components/StickyNote.tsx` | Create | sticky view: drag header + close + editor |

---

## Verification

- `npm run typecheck` + `npm run build` clean; `npm run test` still green.
- Manual (`npm run dev`): open a sticky (via devtools `window.api.window.sticky.open('note.md')` until P02 adds the pin button); the note renders, typing + Cmd/Ctrl+S saves, reopening the file in the main window shows the change.

---

## Notes

- **Do NOT reuse `workspaceStore`** in the sticky: its `persistWorkspace` writes `openTabs` to the shared `settings.json`, which would overwrite the main window's restored tabs. This is the whole reason for a dedicated `stickyStore`.
- The editor core (`src/renderer/editor/`, `createTabState`) is decoupled from the store; `EditorHost` is only the workspace wrapper. Mount `createTabState` directly with sticky callbacks.
- Frameless windows have no OS title bar → provide a `-webkit-app-region: drag` header or the window can't be moved; make interactive controls `no-drag`.
- Theme store is per-process; simplest is to read the theme once on mount and apply it (no need to subscribe to live theme changes in v1).

---

## Review Log

### 2026-07-01 — Phase Review: APPROVED

**Tasks**: 5/5 genuinely complete — verified against real code (`App.tsx` route branch, `stickyStore`, `StickyNote` with drag header + close + direct CM6 mount via `createTabState`, theme load + reconfigure, save-on-blur/beforeunload).
**Quality**: PASS — full suite 218/218; typecheck (node+web) clean; `npm run build` clean; the 3 new/changed files biome-clean. Pre-existing baseline noise untouched.
**Integration**: `#/sticky/<path>` route renders `StickyNote`; the P00 IPC (`window.api.window.sticky.close`) is used by the close button; editor core reused via `createTabState`. `stickyStore` is standalone and never touches `workspaceStore` (verified — no import). Pin entry point + cross-window sync are P02 (by design).
**Plan integrity**: OK — P02 (pin UI, all-window broadcast, close-on-delete/lock) + P03 UAT cover the rest.
**Commit**: none (user directive: skip commits this session)

**Finding (adversarial audit — REAL data loss on close, fixed inline)**:
- **Closing a sticky with unsaved edits could drop them.** The X button destroyed the window immediately; the `blur`/`beforeunload` saves are fire-and-forget async and can race the teardown. Fixed: the close button now `await useStickyStore.getState().save()` before calling `sticky.close(notePath)`. Blur/beforeunload remain as backups.

**Bug caught + fixed during impl** (pre-review): an unescaped apostrophe in a JSX string (`'…it's locked'`) broke the parse — rewritten with typographic apostrophes.

**Note (not blocking) — watch item**:
- **Quit with edits typed but not blurred/saved**: if the user types in a sticky and immediately quits the app without the sticky losing focus, the last edits may not flush (beforeunload save is best-effort on teardown). Mitigated in practice by save-on-blur (any focus change saves) and the explicit-close save. If it bites during dogfooding, add a short debounced autosave to `stickyStore`. Consistent with the app's overall last-write-wins / manual-save model.
