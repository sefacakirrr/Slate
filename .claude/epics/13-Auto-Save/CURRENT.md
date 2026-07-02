# Epic 13 — Auto-Save: Progress

## Status: IMPLEMENTED (both phases) — awaiting /epic-phase-review

## Current phase: Phase 2 — Polish & Tests (complete)

| # | Task | Status |
|---|------|--------|
| 1 | Add `autoSave` to SettingsService | done |
| 2 | IPC channels for autoSave | done |
| 3 | Settings toggle UI | done |
| 4 | Debounced save logic | done |
| 5 | Cancel on external file change | done |
| 6 | Dirty indicator clear | done |
| 7 | Ctrl+S flush | done |
| 8 | Unit tests | done |
| 9 | Integration test | done |

## Notes

- Task 6 required no new code: the tab dirty dot is driven by `tab.dirty`, which
  `saveTab` clears when the debounced save lands. Asserted in unit tests.
- Debounce lives in `workspaceStore` (module-level timer map keyed by tab path),
  interval exported as `AUTO_SAVE_DEBOUNCE_MS` (1000 ms).
- `reloadTab` now cancels a pending debounced write and adopts disk content when
  a genuine external change arrives (plan's no-conflict rule). A dirty tab with
  no pending auto-save still refuses the reload (unchanged behavior).
- `renameTab` re-keys a pending save to the new path; `removeTab`/`reset`/
  `closeFolderTabs`/toggle-off all cancel pending timers.
- Integration test: `src/renderer/stores/autoSave.integration.test.ts` (draft →
  debounce → real file on temp disk).
