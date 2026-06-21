# Phase 03: Tests & Polish

> **Status**: NOT STARTED
> **Dependencies**: Phase 02

---

## Goal

Restore and extend test coverage for the new workspace model, remove dead single-note code, and bring the full pipeline green before UAT.

---

## Tasks

| # | Task | Status | Acceptance Criteria |
|---|------|--------|---------------------|
| 3.1 | `workspaceStore` unit tests — open (add vs focus existing), activate, close (incl. neighbor activation), per-tab dirty independence, `saveActiveTab` success/failure | done | Vitest covers the tab lifecycle + dirty math (mock `@renderer/api`, like the old editorStore test) |
| 3.2 | Persistence tests — workspace shape persists/restores; missing files dropped on restore; rename updates the open tab | done | Covered with a mocked api / SettingsService temp-file test |
| 3.3 | `SettingsService` test update — `workspace` field round-trips; old `lastNotePath` tolerated | done | Vitest green; no regression in E1/E2 main tests |
| 3.4 | Remove dead code — any leftover single-note paths (`editorStore` remnants, retired `vaultStore` switch methods, unused `lastNote` IPC) | done | grep clean; no unused exports |
| 3.5 | Full gate: `npm run check && npm run typecheck && npm run test && npm run build` all exit 0 | done | All green; no runtime console errors |

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/renderer/stores/workspaceStore.test.ts` | Create | Tab lifecycle + dirty + save |
| `src/main/services/SettingsService.test.ts` | Modify | Workspace persistence shape |
| (various) | Modify | Dead-code removal |

---

## Verification

All four gate commands exit 0. New workspace tests pass; E1/E2 suites unaffected. Manual `npm run dev` shows no console errors during tab open/switch/close/restore.

---

## Notes

- Mirror the `editorStore.test.ts` approach for renderer-store tests: `vi.mock('@renderer/api', …)` + `vitest.config.ts` aliases (already in place).
- CM6 `EditorState`/`view` behavior (cursor/undo preservation) is not unit-testable without a DOM — UAT covers it; tests target the pure store logic.

---

## Review Log

### 2026-06-14 — Phase Review: APPROVED

**Tasks**: 5/5 genuinely complete, 0 stubs, 0 partial
**Quality**: PASS — `check` ✓, `typecheck` (node + web) ✓, `test` 68 passed ✓, `build` ✓
**Integration**: `workspaceStore` consumed by App, ContentPane, Sidebar, TabBar, EditorHost (+ vaultStore rename→tab) — not isolated
**Plan integrity**: OK — no vision-coverage gaps in remaining work; next phase is UAT
**Commit**: uncommitted (project directive: no commits)

**Findings**:
- 3.1 verified real: `workspaceStore.test.ts` (32 tests) covers open add/focus/read-fail, activate, per-tab dirty independence, neighbor activation (left/new-first/non-active/last→null), save success/fail/draft-changed-during-write, close-prompt Save/Discard/Cancel incl. save-fail abort, rename, reset, restore (drop missing, ignore missing-active, read-fail noop).
- 3.2/3.3 already satisfied by Phase 02's `SettingsService.test.ts` (workspace round-trip + old `lastNotePath` tolerance) — not duplicated.
- 3.4 dead-code sweep clean: `editorStore.ts` absent; no `requestSelectFile`/`pendingSelection`/`saveAndProceed`/`discardAndProceed`/`lastNotePath` accessors remain (only intentional old-key tolerance comments).
- Test stderr lines are the store's own intentional `console.error` on failure paths, exercised by the failure tests — expected, not noise.

**Deferred**: none.
