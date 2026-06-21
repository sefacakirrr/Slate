# Current: Phase 05 — User Acceptance Testing

> **Only the user can mark this phase complete.** This is the sign-off gate for Epic 04.

## What to Do

Work through the scenarios in `phases/PHASE-05-UAT.md` against a real vault in `npm run dev`. All implementation (Phases 00–04) is complete, reviewed, and green; this phase verifies the search feature end-to-end in the running app and captures the user's sign-off.

## Implementation State (Phases 00–04, all APPROVED)

The full search pipeline is built and wired:

- **IndexService** (P00) — SQLite FTS5 index in `userData/index.db`, trigger-synced; index/remove/rename/rebuild + `getIndexed`.
- **SearchService** (P01) — ranked `MATCH` + `snippet()`; query sanitization that never throws on bad input.
- **Wiring** (P02) — services constructed in `main/index.ts`; launch reconciliation (`reconcile.ts`, mtime-diff, self-healing); the 4 mutation handlers update the index best-effort; `search:query` + `index:rebuild` IPC across shared→handlers→preload→api.
- **Search UI** (P03) — `Ctrl+Shift+F` panel: debounced query, ranked results with `<mark>`-highlighted snippets, click → `openTab`; empty/no-results states.
- **Tests & polish** (P04) — 110 tests green (Index 11, Search 9, reconcile 5, searchStore 7, searchHighlight 6, +Vault 4 and the E1–E3 suites); full gate (check/typecheck/test/build) exit 0; dead-code swept.

**Coverage boundary the UAT must honor:** unit tests cover the pure/logic layers. The wiring layers — `handlers.ts` index hooks + `search:query`/`index:rebuild`, `main/index.ts` runtime (db creation, reconcile-at-launch, close-on-quit), and `SearchPanel.tsx` DOM behavior — are **deliberately UAT-only** (the project's established boundary). Scenarios 1–8 are what exercises them, so run them for real, not on faith.

## Watch For (two items the review flagged — both already encoded as UAT scenarios)

1. **Manual rebuild has no UI affordance (scenario 9).** `index:rebuild` is plumbed through IPC and preload but no button calls it. Verify criterion 6 from the devtools console: `await window.api.index.rebuild()` → expect `{ ok: true }`, then re-query and confirm identical results. A user-facing "Rebuild index" affordance is in the backlog ([feature] low, 2026-06-15).
2. **Fresh-vault-pick reconcile gap (scenario 10).** Picking a *different* vault mid-session does NOT reconcile — its notes are unsearchable until relaunch (`setVaultPath` doesn't trigger `reconcileIndex`). This is a known, accepted-pending limitation tracked in the backlog ([feature] medium, 2026-06-15). The normal path (vault already set at launch) is unaffected. Confirm this is acceptable for v1 or pull the backlog fix forward.

## On Sign-Off

When the user approves: check the Sign-Off box + date in PHASE-05, then `/epic-close` for the cross-phase audit and SUMMARY.md. After E4 closes, ROADMAP M2 advances (E4 done; E5 Tags / E6 Attachments / E7 Capture / E8 Settings remain).

## No commits

Project directive — "no commits until ready", consistent with E1–E3. Tracking reads "uncommitted" throughout.
