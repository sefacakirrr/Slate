# Epic 03: Tabs & Workspace — Summary

> **Duration**: 2026-06-13 to 2026-06-14
> **Phases**: 5 completed (00–04)
> **Status**: COMPLETE

---

## Results

Replaced the single-note model (E2's `vaultStore.selectedPath` + single `editorStore`) with a multi-tab workspace:

- **`workspaceStore`** — ordered open tabs + active tab; open/activate/close/remove, per-tab dirty, save/saveActive, close-prompt resolution, persist/restore, rename, reset. 32 unit tests.
- **Per-tab CM6 `EditorState`** — single `EditorView`, one `EditorState` per tab swapped via `view.setState`; cursor/scroll/undo preserved losslessly across switches.
- **Tab bar** — active highlight, per-tab dirty dot, per-tab close (×).
- **Close-with-dirty prompt** — Save / Discard / Cancel on closing an unsaved tab (switching is free; E2's dirty-switch guard retired).
- **Persistence** — `settings.{openTabs, activeTab}` (generalized from the single `lastNotePath`); restored on launch, missing files dropped silently.
- **Rename↔tab** — renaming an open note re-points its tab, keeping draft/baseline/dirty.

All 9 VISION success criteria verified (1–8 via UAT, 9 via the automated gate). Final gate: `check` / `typecheck` / `test` (68 passed) / `build` all green.

---

## Learnings

### What Worked
- **Keeping the single `EditorView` + per-tab `EditorState` map** (vs. one view per tab) — the CM6-idiomatic path; activation is just `view.setState`.
- **Dirty/save logic living in the store, not the editor** — made the riskiest new code unit-testable (32 tests) without a DOM; the store is the source of truth, the editor a projection.
- **Phased refactor leaning on the E1/E2 regression suite** — retiring the switch-guard only once `openTab` replaced it kept working code green throughout.

### What Didn't Work
- **The tab-switch state-writeback bug** (EditorHost): the per-tab `EditorState` map was populated only on *first* activation, so the outgoing tab's live `view.state` was never written back — switching away and back restored stale text and lost cursor/scroll/undo. Unit tests can't reach this (no DOM); it surfaced at UAT and was fixed with an effect-cleanup writeback. **Lesson**: any "live editor state stored in a ref/map" needs an explicit save-on-switch-away, and that path is UAT-only — flag it as a manual-check hotspot in the phase handoff (it was, which is why UAT caught it fast).

### For Future Epics
- When a feature has a DOM/editor-state dimension that unit tests structurally can't cover, call it out explicitly in CURRENT.md's "Watch For" so UAT targets it first. That worked here — Scenario 2 was pre-flagged as the riskiest and caught the bug immediately.

---

## Deferred Items

| Item | Reason | Follow-up |
|------|--------|-----------|
| Quit-with-dirty guard | Closing the app with a dirty tab discards unsaved edits silently (no prompt; drafts not persisted, tab reopens clean). Out of E3 scope — the prompt covers tab close, not app quit. User accepted for v1 after the data-loss risk was flagged. | `.claude/backlog/tasks.md` — UAT-driven, 2026-06-14, [feature] high |
