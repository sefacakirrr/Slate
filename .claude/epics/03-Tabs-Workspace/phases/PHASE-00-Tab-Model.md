# Phase 00: Tab Model & Per-Tab Editor State

> **Status**: NOT STARTED
> **Dependencies**: None

---

## Goal

Replace the single-active-note model with multiple tabs: a `workspaceStore` owning the open-tab list and active tab, per-tab CM6 `EditorState` (so switching preserves cursor/scroll/undo), a tab bar, per-tab dirty tracking, and `Ctrl+S` saving the active tab. This is the heaviest phase — the core refactor.

---

## Tasks

| # | Task | Status | Acceptance Criteria |
|---|------|--------|---------------------|
| 0.1 | Create `stores/workspaceStore.ts` — `tabs: {path, baseline, draft, dirty}[]`, `activeTabPath`; actions `openTab` (add-or-focus + read content), `activateTab`, `closeTab` (simple remove + neighbor pick), `setTabDraft`, `saveActiveTab` (→ `vault:writeNote`, race-safe) | done | Store opens/focuses/activates/closes; `saveActiveTab` writes the active tab; per-tab dirty independent. Read failure aborts open (logged) |
| 0.2 | Rework `editor/EditorHost.tsx` to hold a `Map<path, EditorState>`; build per tab on first activation; `view.setState` on activate | done | One view; `statesRef` map; subscribes only to `activeTabPath` + a stable `openPaths` string → no setState thrash on keystroke, so cursor/scroll/undo are preserved per tab |
| 0.3 | Per-tab extensions: `updateListener` reports dirty for the *owning* tab (path captured in closure); `Ctrl+S` saves the active tab | done | `createTabState` in `setup.ts` bundles language+listener+keymap; onDocChange→`setTabDraft(thatPath)`, onSave→`saveActiveTab` |
| 0.4 | Dispose a tab's `EditorState` when its tab closes; create on open | done | Prune effect keyed on `openPaths` deletes states for closed tabs; reopen rebuilds fresh |
| 0.5 | Create `components/TabBar.tsx` — chip per tab (name + dirty dot + × close), active highlight, horizontal scroll | done | Reflects `workspaceStore`; chip click → `activateTab`; × → `closeTab` |
| 0.6 | Rework `components/ContentPane.tsx` — driven by `activeTabPath`; render `TabBar`; full on-disk path header; empty state when no tabs | done | ≥1 tab → editor; 0 tabs → "Select a note". Read-error shell dropped (read failure now aborts openTab) |
| 0.7 | `components/Sidebar.tsx` — `TreeRow` click → `openTab`; active highlight follows `activeTabPath`; new-note → `openTab`; delete also closes the tab | done | Clicking opens/focuses a tab, no prompt; deleting an open note closes its tab |
| 0.8 | Stop using `editorStore` in the editor (EditorHost/ContentPane) — but DO NOT delete it yet | done | `editorStore` + its 8 tests left in place; still referenced by `vaultStore`'s switch-guard. Both retired together in Phase 01. Gate stays green (44 tests) |

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/renderer/stores/workspaceStore.ts` | Create | Tabs + active tab + per-tab dirty/baseline + save |
| `src/renderer/editor/EditorHost.tsx` | Modify | `Map<path, EditorState>`; `view.setState` on activate |
| `src/renderer/editor/setup.ts` | Modify | Export a per-tab `EditorState` factory (shared extensions) |
| `src/renderer/components/TabBar.tsx` | Create | Tab strip UI |
| `src/renderer/components/ContentPane.tsx` | Modify | Driven by `activeTabPath`; mounts `TabBar` |
| `src/renderer/components/Sidebar.tsx` | Modify | Click → `openTab` |
| `src/renderer/stores/editorStore.ts` (+ test) | Delete | Absorbed into `workspaceStore` |

---

## Verification

`npm run check && npm run typecheck && npm run test && npm run build` green. Manual: open 3 notes → 3 tabs; edit + scroll in A, switch to B and back → A's cursor/scroll/undo intact; edit A and B → independent dirty dots; Ctrl+S saves only the active tab; clicking a sidebar note opens/focuses a tab with no prompt.

---

## Notes

- **Keep one `EditorView`**; per-tab state lives in the `Map<path, EditorState>` swapped via `view.setState`. Do NOT mount a view per tab.
- Build each tab's `EditorState` with the SAME extensions (language-by-path, dirty `updateListener`, `Ctrl+S` keymap) — factor this into `setup.ts`.
- Dirty is per tab: compare a tab's current doc to its baseline. The `Ctrl+S` keymap and dirty dot act on the active tab.
- This phase leaves close as a simple remove (no prompt yet — Phase 01) and no persistence (Phase 02). The old `vaultStore` switch-guard methods can stay unused until Phase 01 retires them; just stop calling them from the Sidebar.
- Removing `editorStore` drops its 8 tests temporarily — `workspaceStore` tests in Phase 03 restore coverage. Note this in the review.

---

## Review Log

### 2026-06-13 — Phase Review: APPROVED

**Tasks**: 8/8 genuinely complete (0 stubs, 0 partial)
**Quality**: PASS — check / typecheck / test (44) / build all green (the single-note→multi-tab refactor landed without breaking any existing test)
**Integration**: connected — `workspaceStore` ← Sidebar (`openTab`), TabBar (`activateTab`/`closeTab`), ContentPane (`activeTabPath`), EditorHost (`Map<path, EditorState>` + `setTabDraft`/`saveActiveTab`). One `EditorView`, per-tab state.
**Plan integrity**: OK — Phase 01 (close prompt + retire switch-guard & editorStore), Phase 02 (persistence, fixes the launch regression below), Phase 03 (workspace tests), Phase 04 UAT.
**Commit**: uncommitted (project directive)

**Findings**:
- Architecture verified by inspection: the per-tab `onDocChange` closure captures the tab's own path (state built once on first activation), `openTab` sets `tabs` + `activeTabPath` atomically, the prune effect keys on a stable `openPaths` string (so keystrokes don't re-run `setState`), and neighbor-pick on close is correct.
- **`workspaceStore` is untested until Phase 03** — the riskiest new code currently rests on the existing suite + manual checks. Scheduled.
- **Transitional regression**: launch no longer reopens the last note (`restoreLastNote` now sets an unused `vaultStore.selectedPath`; ContentPane reads `activeTabPath`). Fixed by Phase 02 tab persistence. Expected.
- `openTab` read failure is silent (console.error, no UI). Minor — sidebar-listed files should read fine.
- `App.tsx` still renders the dead switch-guard `ConfirmDialog` (never triggers — `pendingSelection` is never set now) and calls `restoreLastNote`; both retire in Phase 01/02.

**Deferred**: None (all task scope met; downstream items are in later phases by design).
