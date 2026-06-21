# Epic 04: Search & Indexing — Summary

> **Duration**: 2026-06-14 to 2026-06-15
> **Phases**: 6 completed (00–04 implementation + reviewed; 05 UAT user-signed)
> **Status**: COMPLETE

---

## Results

Slate can now find a note by its content. A local full-text search over the whole vault, backed by SQLite FTS5 — the first feature that makes a growing vault navigable beyond the filename tree. User-verified end-to-end in `npm run dev`.

- **IndexService** (`main/services/IndexService.ts`) — SQLite FTS5 index in `userData/index.db`, external-content table trigger-synced to a `notes(path, mtime, content)` table. `indexNote`/`removeNote`/`renameNote`/`rebuild`/`getIndexed`, path-keyed for incremental updates. 11 unit tests.
- **SearchService** (`main/services/SearchService.ts`) — ranked `MATCH` (bm25) + `snippet()`; read-only over the shared connection. Query sanitization that **never** surfaces an FTS5 syntax error (each token quoted-as-literal, last token prefixed for as-you-type). 9 unit tests.
- **Reconciliation** (`main/services/reconcile.ts`) — self-healing launch sync: mtime-diff disk vs index, re-index new/changed, drop deleted, skip unchanged. Pure function, 5 unit tests.
- **Wiring** (`main/index.ts`, `main/ipc/handlers.ts`) — services constructed in main (db in `userData`, closed on quit); reconcile at launch; the 4 mutation handlers update the index **best-effort** (a failing index write never fails the user's vault op); `search:query` + `index:rebuild` IPC across shared → handlers → preload → renderer api.
- **Search UI** (`renderer/components/SearchPanel.tsx`, `stores/searchStore.ts`, `components/searchHighlight.ts`) — `Ctrl+Shift+F` overlay: debounced query, ranked results with `<mark>`-highlighted snippets (split on private-use sentinels, never `dangerouslySetInnerHTML`), click → `workspaceStore.openTab`; empty/no-results states; stale-response guard. 13 renderer tests.

**Test count**: 79 → 110 (+31 across IndexService, SearchService, reconcile, searchStore, searchHighlight, and VaultService mtime listing).

### Success Criteria (VISION §4) — 7/7

| # | Criterion | Result | Evidence |
|---|-----------|--------|----------|
| 1 | Query <2s, ranked + snippets on ~500 notes | PASS | UAT scenario 1, 7 |
| 2 | Click result → opens note in a tab | PASS | UAT scenario 2 |
| 3 | In-app save/create/delete/rename updates results, no restart | PASS | UAT scenarios 3–5 |
| 4 | External change reflected after relaunch | PASS | reconcile 5 tests + UAT scenario 6 |
| 5 | Index in `userData`, vault clean markdown | PASS | UAT scenario 8 |
| 6 | Manual rebuild → identical results | PASS | UAT scenario 9 (via devtools — no UI affordance in v1) |
| 7 | Gate green; services unit-tested | PASS | 110 tests; check/typecheck/test/build exit 0 |

---

## Learnings

### What Worked
- **Building the index engine pure of Electron and the filesystem** (IndexService takes `content`/`mtime`, never reads disk) made the riskiest piece unit-testable against a temp db and confined all file IO to one reconciliation coordinator. Same discipline paid off extracting `reconcile.ts` as a pure function — the integration-risk logic got 5 tests without an Electron runtime.
- **Sanitization by quoting-as-literal** turned out bulletproof: strip `"`, drop punctuation-only tokens, wrap each survivor in `"…"` (FTS5 operators become literal tokenizer input), prefix the last token. No constructed input broke it — the review couldn't either.
- **The locked-but-extensible IPC contract** absorbed two new channels (`search:query`, `index:rebuild`) with the same handler→preload→api triad as E1/E3 — no contract churn.
- **Incremental coverage** meant Phase 04 ("tests & polish") was nearly a no-op: the reconciliation/service/store tests were already written in their own phases, so 04 was a verification + dead-code sweep, not a scramble.

### What Didn't Work
- **Invisible private-use sentinel characters in source are fragile.** The snippet markers `U+E000`/`U+E001` were first written as literal code points; the editor tooling silently stripped them to empty strings in one file (caught via `od`, not by typecheck — empty markers are still valid strings). Fixed by switching both the source and tests to `String.fromCharCode(0xe000/0xe001)` — plain ASCII that can't be silently corrupted. **Lesson**: never embed invisible/PUA literals in source; construct them from code points.
- **The snippet-marker cross-process coupling** (renderer can't import the main-process consts; `shared` is types-only) forced the marker contract to be duplicated by hand in `searchHighlight.ts`. Acceptable, but it's a contract that two files must keep in sync with only a comment binding them.
- **"Manual rebuild" shipped as IPC with no UI trigger.** The deliverable was listed in VISION but no phase ever planned a button, so criterion 6 is only reachable from the devtools console in v1. Caught at the final pre-UAT review, not earlier — VISION deliverables should be cross-checked against phase task lists during `/epic-plan`, not just at close.

### For Future Epics
- When a VISION deliverable implies a user action (here: "manual rebuild"), make sure some phase has a task for the **user-facing trigger**, not just the plumbing. Plumbing without an affordance reads as "done" in code but fails a UAT criterion.
- Cross-process constant contracts (sentinels, enums) want a single home. Since `shared` is types-only by project rule, consider whether a types-only `const enum` or branded string type could at least make the renderer/main duplication type-checked rather than comment-bound.

---

## Deferred Items

| Item | Reason | Follow-up |
|------|--------|-----------|
| Reconcile on vault change (not only at launch) | `setVaultPath` doesn't trigger reconciliation — a vault picked first-time mid-session is unsearchable until relaunch. Normal case (vault set at launch) unaffected; self-heals on relaunch. Accepted for v1 at UAT (scenario 10). | `.claude/backlog/tasks.md` — [feature] medium, 2026-06-15 |
| Manual "Rebuild index" UI affordance | `index:rebuild` IPC exists and is preload-exposed, but no renderer control triggers it — devtools-only in v1. | `.claude/backlog/tasks.md` — [feature] low, 2026-06-15 |
| chokidar live external-change watcher | Explicitly out of E4 scope (one-epic-one-problem); external edits reconcile at next launch. Also serves sidebar live-refresh, so it's its own epic. | Future "Vault watcher" epic (carries the orphaned E1→E2→E4 deferral) |
| Tag / folder search filters | Tags don't exist until E5. | E5 — Tags & Hashtags |

---

## Note on Commits

Per standing project directive ("no commits until the project is ready"), Epic 04 closes **uncommitted** — all phases, services, UI, and tests remain in the working tree, consistent with E1–E3. The first commit awaits an explicit user request.
