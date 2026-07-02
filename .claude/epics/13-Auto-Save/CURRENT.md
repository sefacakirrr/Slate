# Epic 13 — Auto-Save: Progress

## Status: COMPLETE — reviewed & approved

Both phases implemented, audited, and approved on 2026-07-02.
Commits: `0ba9a69` (implementation), `4646572` (toggle knob position fix).

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

## Review Log

### 2026-07-02 — Phase Review: APPROVED

**Tasks**: 9/9 genuinely complete (verified against code, not table status)
**Quality**: typecheck PASS, tests 244/244 PASS, lint has 4 pre-existing
a11y errors in Sidebar.tsx (predate this epic, untouched by it)
**Integration**: all connected — setting loads in App startup, toggle in
SettingsPanel, debounce fires through the production saveTab path,
reloadTab cancel-on-external-change wired to onNoteChanged
**Commit**: 0ba9a69, 4646572

**Evidence highlights**:
- Debounce: `workspaceStore.ts` `scheduleAutoSave` (module-level timer map),
  re-checks toggle + tab existence at fire time
- Ctrl+S flush: `saveTab` cancels the pending timer first (no double write);
  editor `Mod-s` keybinding → `saveActiveTab` (setup.ts)
- Dirty indicator: TabBar renders dot from `tab.dirty`; cleared by saveTab
  on save success — no separate code needed
- External change: `reloadTab` cancels pending write and adopts disk content
  only when a timer was pending; dirty-without-timer still refuses reload
- Tests: 12 fake-timer unit tests + 3-test disk integration suite
  (`autoSave.integration.test.ts`)

**Findings** (non-blocking):
- Sticky notes save on blur, not via this debounce — acceptable (out of the
  epic's scope, which targeted the main editor tabs)
- Quit flow: dirty tabs at quit still prompt; with auto-save on, the window
  is ≤1 s. A quit-time flush could remove the prompt entirely — backlog candidate.

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
