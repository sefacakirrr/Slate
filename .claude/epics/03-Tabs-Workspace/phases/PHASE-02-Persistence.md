# Phase 02: Tab Persistence

> **Status**: NOT STARTED
> **Dependencies**: Phase 01

---

## Goal

Restore the workspace across launches: persist the open tab paths + active tab, restore them on startup (dropping any files that no longer exist), and keep open tabs correct when a note is renamed.

---

## Tasks

| # | Task | Status | Acceptance Criteria |
|---|------|--------|---------------------|
| 2.1 | Generalize persisted settings: `lastNotePath` → `workspace: {openTabs, activeTab}` in `SettingsService` (migration-tolerant) | done | `WorkspaceData` field + `getWorkspace`/`setWorkspace`; `getWorkspace` falls back to empty for a pre-existing file without the key (tested) |
| 2.2 | IPC: `settings:getLastNote`/`setLastNote` → `settings:getWorkspace`/`setWorkspace` (contract, handlers, preload, api) | done | Typed round-trip; old channels fully removed |
| 2.3 | `workspaceStore`: persist `{openTabs, activeTab}` whenever tabs/active change | done | `persistWorkspace` called from openTab/activateTab/removeTab/renameTab/reset/restoreWorkspace |
| 2.4 | Restore on launch: open each persisted tab whose file exists (skip missing), activate the persisted active | done | `restoreWorkspace`: loops `openTab` (read-fail skips missing), then sets `activeTabPath` if still present |
| 2.5 | Replace `restoreLastNote` wiring in `App.tsx` with `restoreWorkspace`; retire dead single-note paths | done | App calls `restoreWorkspace`; removed `selectFile`/`loadSelectedContent`/`restoreLastNote`/`selectedPath`/`noteContent`/`noteError` + all `setLastNote` calls from `vaultStore` |
| 2.6 | Rename ↔ tab: update any open tab on rename | done | `workspaceStore.renameTab(old,new)` (keeps draft/baseline/dirty, re-points active, persists); Sidebar calls it after a successful `renameNote`. EditorHost reconciles via the `openPaths` prune + rebuild |

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/main/services/SettingsService.ts` (+ test) | Modify | `workspace` field; drop/migrate `lastNotePath` |
| `src/shared/ipc.ts` | Modify | `settings:getWorkspace` / `setWorkspace` |
| `src/main/ipc/handlers.ts` | Modify | Wire the workspace handlers |
| `src/preload/index.ts` | Modify | Expose `getWorkspace`/`setWorkspace` |
| `src/renderer/stores/workspaceStore.ts` | Modify | Persist on change; `restoreWorkspace` |
| `src/renderer/App.tsx` | Modify | Call `restoreWorkspace` on launch |
| `src/renderer/stores/vaultStore.ts` | Modify | Rename updates the open tab + persisted set |

---

## Verification

`npm run check && npm run typecheck && npm run test && npm run build` green. Manual: open 3 tabs, restart → all 3 restored + same active; externally delete one of the 3, restart → it's dropped silently; rename an open note → its tab updates; restart → renamed tab restored under the new path.

---

## Notes

- Restore must filter against existence (reuse `listNotes` or a stat) — same staleness guard as E2's last-note restore.
- Keep restore resilient: a corrupt/missing workspace value falls back to "no tabs" (empty state), never a crash.
- Persisting on every activate is fine (small JSON write), matching E2's per-selection `setLastNote` cadence.

---

## Review Log

### 2026-06-13 — Phase Review: APPROVED

**Tasks**: 6/6 genuinely complete (0 stubs)
**Quality**: PASS — check / typecheck / test (36) / build all green
**Integration**: connected — `SettingsService.workspace` ↔ `settings:getWorkspace`/`setWorkspace` ↔ `workspaceStore` (persist on mutate, `restoreWorkspace` on launch); `App` → `restoreWorkspace`; Sidebar → `renameTab` after a successful rename.
**Plan integrity**: OK — Phase 03 (workspace unit tests + dead-code sweep), Phase 04 UAT.
**Commit**: uncommitted (project directive)

**Findings**:
- **Launch regression FIXED**: tabs + active tab now restore on relaunch; files deleted meanwhile are skipped (openTab's read-failure abort).
- `vaultStore` cleaned: removed the now-dead single-note paths (`selectFile`/`loadSelectedContent`/`restoreLastNote`/`selectedPath`/`noteContent`/`noteError`) and all `setLastNote` calls.
- `SettingsService.getWorkspace` is tolerant of a pre-existing file without the `workspace` key (e.g. an old `lastNotePath` settings.json) — covered by a test.
- rename↔tab: a renamed open tab is reconciled by `EditorHost` via the `openPaths` prune + lazy rebuild (content preserved from the store draft; cursor resets on rename). Acceptable.
- `restoreWorkspace` writes a few intermediate persisted states during its open loop — harmless (final state is correct).

**Deferred**: None
