# Epic 11: Desktop-Sticky-Notes — Planning

> **Status**: COMPLETE
> **Closed**: 2026-07-01
> Phase structure, dependencies, and progress tracking.
> Source: VISION.md (2026-07-01). Decisions: dedicated `stickyStore` (NOT the shared `workspaceStore` — it persists tabs to settings and would clobber the main window); last-write-wins sync (no live reload of an open note); locked `.md.enc` notes excluded from stickies in v1; zero new dependencies (Electron window APIs only).

---

## Phase Overview

| Phase | Name | Goal | Dependencies | Status | Progress | Reviewed | Commit |
|-------|------|------|-------------|--------|----------|----------|--------|
| 00 | Sticky Window Infra (main) | `WindowManager` sticky lifecycle + geometry persistence + IPC + restore/quit — no UI | None | COMPLETE | 7/7 | ✓ | (uncommitted) |
| 01 | Sticky Renderer View | `#/sticky/<path>` route, `stickyStore`, `StickyNote` with reused CM6 editor, save-to-file | Phase 00 | COMPLETE | 5/5 | ✓ | (uncommitted) |
| 02 | Pin UI + Cross-Window + Guards | Sidebar pin action, exclude locked, broadcast `vault:filesChanged` to all windows, graceful close on delete/lock | Phase 01 | COMPLETE | 6/6 | ✓ | (uncommitted) |
| 03 | Near-Live Multi-Window Sync | `vault:noteChanged{path}` event, reload-if-not-dirty in sticky + main tab, sticky debounced autosave | Phase 02 | COMPLETE | 7/7 | ✓ | (uncommitted) |
| 04 | User Acceptance Testing | User verifies end-to-end incl. sync + macOS/Windows | All phases | COMPLETE | 10/11 | ✓ | (uncommitted) |

**Status values**: NOT STARTED → IN PROGRESS → COMPLETE
**Reviewed**: Set only by /epic-phase-review (mandatory before COMPLETE)
**Commit**: Implementation commit hash (7 chars)

---

## Critical Path

```
Phase 00 (main-side sticky infra)
   → Phase 01 (renderer sticky view)
      → Phase 02 (pin UI + cross-window list sync + guards)
         → Phase 03 (near-live content sync + autosave)
            → Phase 04 (UAT)
```

Linear. P00 stands alone (window lifecycle + persistence, testable settings layer). P01 makes a sticky render + edit. P02 wires the entry point (pinning) and the list/edge-case behavior. **P03 (added 2026-07-01 by user request)** adds on-save content reload across windows + sticky autosave — including the main-window "reload an open tab on external change" behavior that never existed. P04 is manual cross-platform verification.

---

## Cross-Cutting Decisions (every phase)

- **Store isolation**: each window is its own renderer process with its own Zustand store. A sticky uses a dedicated `stickyStore` and NEVER `workspaceStore` (which persists open tabs to the shared `settings.json`).
- **Geometry lives main-side**: `WindowManager` persists each sticky's bounds from its own `move`/`resize` events (debounced ~500ms) + a final flush on `will-quit`. No renderer geometry IPC.
- **Self-close by path**: a sticky closes via `window:sticky:close(path)` (the generic `window:close` is hardwired to the main window).
- **Source of truth = the vault file**; last-write-wins, no live reload of an already-open note.
- **Locked notes excluded** from stickies in v1 (enforced in both the UI and the `window:sticky:open` handler).
- Same renderer bundle + preload for all windows; `#/sticky/<encodeURIComponent(path)>` route.
- Tests where the layer allows (SettingsService stickies round-trip). `WindowManager`/BrowserWindow and renderer sticky UI are verified by typecheck + build + UAT (consistent with the project's testing approach).
