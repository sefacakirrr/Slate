# Phase 00: Sticky Window Infra (main)

> **Status**: COMPLETE (reviewed 2026-07-01)
> **Dependencies**: None

---

## Goal

All main-process machinery for sticky windows: `WindowManager` can open/close/track frameless always-on-top sticky windows, persist each one's geometry, restore them on launch, and flush on quit — driven by two IPC commands. No renderer UI yet (a sticky will render a blank `#/sticky` route until Phase 01).

---

## Tasks

| # | Task | Status | Acceptance Criteria |
|---|------|--------|-------------------|
| 0.1 | `SettingsService`: add `stickies: StickyRecord[]` (`{ path, bounds: {x,y,width,height} }`) with `getStickies` / `setStickies` / `updateStickyGeometry(path, bounds)`; default `[]`; graceful on missing field | done | Round-trips across instances; absent field → `[]`; unit-tested |
| 0.2 | `WindowManager`: `openSticky(path, bounds?)` — frameless (`frame:false`), `alwaysOnTop:true`, `skipTaskbar:true`, `resizable:true`, no blur-close; loads `#/sticky/<encodeURIComponent(path)>` (dev URL vs `loadFile` hash, mirroring quick-capture). Focus the existing window if already open | done | Calling it opens a floating frameless window; a second call for the same path focuses rather than duplicates |
| 0.3 | Track sticky windows in `stickies: Map<string, BrowserWindow>`; on `closed`, drop from the map and remove from settings | done | Closing a sticky removes it from the map + persisted set |
| 0.4 | Persist geometry: debounced (~500ms) `move`/`resize` listeners → `settings.updateStickyGeometry`; add the sticky to settings on open | done | Moving/resizing then reading settings shows the new bounds; no rewrite storm (debounced) |
| 0.5 | `closeSticky(path)` (destroy + cleanup) and `restoreStickies()` (open each persisted sticky at its bounds, skip a path that no longer exists on disk) | done | `restoreStickies` reopens saved stickies; a stale path is skipped without error |
| 0.6 | IPC `window:sticky:open` (`path`) and `window:sticky:close` (`path`) → `WindowManager`; mirrored in preload as `window.api.window.sticky.open/close` | done | Renderer can open/close a sticky by path; typed end to end |
| 0.7 | Wire into `main/index.ts`: call `restoreStickies()` after `createMainWindow()`; on `will-quit`, flush all live sticky geometries to settings | done | Relaunch restores stickies; quitting mid-drag still saves the last position |

**Status values**: pending → in_progress → done

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/main/services/SettingsService.ts` | Modify | `stickies` field + accessors |
| `src/main/services/SettingsService.test.ts` | Modify | stickies round-trip + geometry update tests |
| `src/main/windows/WindowManager.ts` | Modify | sticky lifecycle, map, geometry listeners |
| `src/shared/ipc.ts` | Modify | `window:sticky:open` / `close` commands + `Api` mirror |
| `src/main/ipc/handlers.ts` | Modify | sticky open/close handlers |
| `src/preload/index.ts` | Modify | `window.api.window.sticky.open/close` |
| `src/main/index.ts` | Modify | `restoreStickies()` on launch; geometry flush on `will-quit` |

---

## Verification

- `npm run test` (SettingsService stickies tests) green; `npm run typecheck` + `npm run build` clean.
- Manual smoke: from devtools, `window.api.window.sticky.open('some-note.md')` opens a frameless always-on-top window (blank body until P01); move it, quit, relaunch → it reopens at the same spot.

---

## Notes

- Reuse the quick-capture creation block as the template (`openQuickCapture`, WindowManager 63–107). Key differences: resizable, NO blur-close, tracked in a Map keyed by note path, geometry persisted.
- Geometry is authoritative in main (from BrowserWindow events) — do NOT round-trip it through the renderer.
- `restoreStickies()` runs after `createMainWindow()` in `app.whenReady()` (see `main/index.ts` ~66/83).
- Encryption/locked exclusion is enforced in P02 (`window:sticky:open` should reject a `.md.enc` path); for P00 the handler can already guard with `isEncryptedPath` to be safe.
- On both platforms `window-all-closed` fires only when the LAST window closes, so an open sticky keeps the app alive after the main window closes — acceptable and consistent.

---

## Review Log

### 2026-07-01 — Phase Review: APPROVED

**Tasks**: 7/7 genuinely complete — verified against real code (`WindowManager` sticky lifecycle, `SettingsService` stickies + 5 tests, IPC open/close, main wiring).
**Quality**: PASS — full suite 218/218 (+5 sticky settings tests); typecheck (node+web) clean; `npm run build` clean; changed files biome-clean. Pre-existing baseline noise left untouched (`main/index.ts` autoUpdater format diff, `handlers.ts` useTemplate).
**Integration**: `openSticky`/`closeSticky` reachable via `window:sticky:open/close` IPC + preload; `restoreStickies` called on launch; `markQuitting` on before-quit; `attachSettings` wired. Renderer sticky view is P01 (route currently renders MainApp fallback — expected).
**Plan integrity**: OK — P01 (renderer view) + P02 (pin UI + cross-window) + P03 (UAT) cover the remaining vision paths. No gaps.
**Commit**: none (user directive: skip commits this session)

**Finding (adversarial audit — REAL macOS regression, fixed inline)**:
- **`app.on('activate')` checked `getAllWindows().length === 0`.** Stickies make "main window closed while a sticky stays open" reachable on macOS; with a sticky open, total window count is non-zero, so clicking the dock icon would NOT reopen the main window — the user could be stranded with only stickies. Fixed: activate now checks `windowManager.getMainWindow() === null`. Also removed the now-unused `BrowserWindow` import.

**Note (not blocking) — carried as a watch item**:
- **SettingsService writes are not serialized.** Concurrent `updateStickyGeometry` (debounced move) and `removeSticky` (close) both read the shared cache and last-write-wins, so a rare simultaneous move+close could momentarily resurrect or drop an entry. Self-corrects on the next write/quit. Same non-serialized pattern the workspace/theme writes already use; a write queue in SettingsService is the fix if it ever bites. Low priority.

**Note**: `WindowManager`/BrowserWindow itself has no unit tests (no Electron-window harness in this project) — verified via build + the SettingsService tests + manual smoke. Full behavior is confirmed in P03 UAT.
