# Phase 04: Tests & Polish

> **Status**: NOT STARTED
> **Dependencies**: Phase 03

---

## Goal

Round out coverage on the integration-risk areas (reconciliation, rename, rebuild, query sanitization), sweep dead code, and bring the full pipeline green before UAT.

---

## Tasks

| # | Task | Status | Acceptance Criteria |
|---|------|--------|---------------------|
| 4.1 | Reconciliation tests — new file indexed, mtime-changed file re-indexed, deleted file dropped, unchanged file skipped | done | Vitest covers the launch-sync logic against a temp vault + temp db |
| 4.2 | Confirm IndexService/SearchService edge coverage from P00/P01 is complete (rename isolation, rebuild-replaces, bad-query no-throw) — fill any gaps | done | No untested public method on either service |
| 4.3 | `searchStore` tests (if added in P03) — query/results/clear via mocked `@renderer/api` | done | Green, or N/A documented if no store was added |
| 4.4 | Dead-code sweep — no orphaned helpers, unused exports, or stray `chokidar` import (watcher was explicitly cut) | done | grep clean; `chokidar` still unused (intentionally, not wired) |
| 4.5 | Full gate: `npm run check && npm run typecheck && npm run test && npm run build` all exit 0; no runtime console errors | done | All green |

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/main/index.ts` (or extracted reconcile fn) | Modify | Make reconciliation unit-testable (pure function over `{disk, indexed, readContent}`) |
| reconciliation test | Create | Cover 4.1 |
| (various) | Modify | Dead-code removal |

---

## Verification

All four gate commands exit 0. New tests pass; E1–E3 suites unaffected. `npm run dev` shows no console errors during index/search/open.

---

## Notes

- If reconciliation lives inline in `main/index.ts` it's hard to test — extract the decision logic into a pure function (`reconcile(disk, indexed) → {toIndex, toRemove}`) and unit-test that; the IO wrapper stays thin.
- The native-module/FTS5 runtime path is exercised by the app (UAT), not unit tests — Vitest runs `better-sqlite3` under Node's ABI, which is fine for the index logic but is NOT a test of the Electron-ABI binary. UAT covers the real runtime.
- **No commits** — project directive.

---

## Review Log

### 2026-06-15 — Phase Review: APPROVED

**Tasks**: 5/5 genuinely complete, 0 stubs, 0 partial
**Quality**: PASS (110 tests; typecheck node+web 0 errors; build green; biome clean; no new warnings)
**Integration**: N/A — verification + sweep phase, no net-new code. Coverage was built incrementally across P00–P03.
**Plan integrity**: OK with one UAT-readiness warning (manual-rebuild trigger, below).
**Commit**: uncommitted (project directive, consistent with E1–E3).

**Findings**:
- Coverage boundary is sound: unit tests cover the pure/logic layers (IndexService 11, SearchService 9, reconcile 5, searchStore 7, searchHighlight 6, VaultService +4). The wiring layers (handlers.ts hooks + `search:query` + `index:rebuild`, `main/index.ts` runtime, `SearchPanel.tsx` DOM) are UAT-only — the project's established boundary — and UAT scenarios 1–8 verified to exercise all of them.
- Dead-code sweep clean: `chokidar` is imported nowhere in `src/` (intentional — watcher cut from E4); E4's single-file exports (`NoteStat`, `IndexedNote`, `NoteEntry`, `SnippetSegment`) are public method type annotations, not orphans.

**Warnings (UAT-readiness, non-blocking)**:
1. **Manual rebuild (VISION criterion 6) has no UI trigger.** `index:rebuild` IPC + `api.index.rebuild` exist and are preload-exposed, but no renderer component calls them — a normal user can't rebuild through the app. Never planned as a UI task in any E4 phase. → UAT verifies via `window.api.index.rebuild()` in devtools (added to PHASE-05 scenarios). A user-facing affordance is tracked in `.claude/backlog/tasks.md` ([feature] low, 2026-06-15).

**Deferred**: none (Phase 04 tasks all met; the rebuild-UI affordance is new scope, sent to backlog).
