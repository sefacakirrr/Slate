# Current: Phase 04 — User Acceptance Testing

## What to Do

This is **UAT — user-driven**. Only the user can mark it complete (sign-off in `phases/PHASE-04-UAT.md`). Run the app (`npm run dev`) and walk the 9 test scenarios in `phases/PHASE-04-UAT.md` against the VISION success criteria. As Claude, your role is to launch the app, guide the user through each scenario, and record pass/fail in the scenario table — not to self-approve.

## Context from Phases 00–03

- **Phases 00–03 are all COMPLETE and reviewed.** The multi-tab workspace is fully implemented and unit-tested.
- `workspaceStore` owns tabs / active / per-tab dirty / save / close-prompt / persist / restore / rename / reset. 32 unit tests green.
- Per-tab CM6 `EditorState` (cursor / scroll / undo preservation) lives in `EditorHost.tsx` — this is the one area **unit tests cannot reach**, so scenarios 2 (cursor/scroll/undo on switch) are the highest-value manual checks.
- Persistence is `settings.{openTabs, activeTab}`; restore drops missing files silently.
- Full automated gate (`check` + `typecheck` + `test` 68 passed + `build`) is green as of the Phase 03 review.

## Watch For

- **Scenario 2 is the riskiest** — per-tab editor-state preservation (cursor, scroll, undo) is the part no unit test covers. Exercise it hard: type, move cursor mid-document, scroll, switch away and back.
- **Scenario 9** needs an actual app restart and an external file deletion between runs — can't be faked in-process.
- No runtime console errors during open / switch / close / restore (success criterion 9).
- **No commits** — project directive. After UAT sign-off, the epic closes via `/epic-close`.

## After Phase 04

UAT sign-off is the last gate before `/epic-close` (cross-phase audit + SUMMARY.md). This is the final phase of Epic 03.
