# Phase 01: Close & Dirty Prompt

> **Status**: NOT STARTED
> **Dependencies**: Phase 00

---

## Goal

Make closing safe and complete the switch-guard relocation: closing a dirty tab prompts Save / Discard / Cancel, closing the active tab activates a sensible neighbor, closing the last tab returns to the empty state — and E2's switch-time guard is retired.

---

## Tasks

| # | Task | Status | Acceptance Criteria |
|---|------|--------|---------------------|
| 1.1 | `closeTab(path)`: if that tab is dirty, open the Save/Discard/Cancel prompt instead of closing immediately (hold a `pendingClose`) | done | `closeTab` dirty → `set({pendingClose})`; clean → `removeTab` |
| 1.2 | Prompt wired to the 3-action `ConfirmDialog`: Save → save-that-tab then close; Discard → close without writing; Cancel → keep the tab | done | `confirmCloseSave` (saves the pending tab via `saveTab`, aborts close if save failed), `confirmCloseDiscard` (removeTab, no write), `cancelClose` |
| 1.3 | Neighbor activation: closing the active tab activates the left neighbor (or the next one if it was first) | done | `removeTab` neighbor pick (`next[idx-1] ?? next[0]`) — carried from Phase 00, now shared |
| 1.4 | Closing the last tab → empty state ("Select a note") | done | `removeTab` sets `activeTabPath = null` when none remain → ContentPane empty state |
| 1.5 | Retire E2's switch-guard | done | Removed `requestSelectFile`/`pendingSelection`/`saveAndProceed`/`discardAndProceed`/`cancelPendingSelection` + the `useEditorStore` import from `vaultStore`; deleted `editorStore.ts` + `editorStore.test.ts` (no remaining importers); removed the old switch `ConfirmDialog` from `App` |
| 1.6 | Move the guard `ConfirmDialog` into the close flow | done | `App` now renders the close prompt keyed on `pendingClose`; "Save before closing?" |

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/renderer/stores/workspaceStore.ts` | Modify | `pendingClose` + dirty-aware close + neighbor pick |
| `src/renderer/App.tsx` | Modify | Remove old switch dialog; render the close prompt |
| `src/renderer/components/TabBar.tsx` | Modify | × triggers the dirty-aware `closeTab` |
| `src/renderer/stores/vaultStore.ts` | Modify | Delete the retired switch-guard methods |

---

## Verification

`npm run check && npm run typecheck && npm run test && npm run build` green. Manual: edit a tab, click × → prompt; exercise Save (persists + closes), Discard (closes, file unchanged on reopen), Cancel (tab stays dirty); close the active tab → neighbor activates; close all → empty state. Switching between tabs never prompts.

---

## Notes

- Reuse the `ConfirmDialog` 3-action variant built in E2 Phase 03 (`onDiscard` + `confirmTone="primary"`).
- The prompt now keys off a *tab* (`pendingClose`), not a pending selection.
- Edge: closing a *non-active* dirty tab should still prompt for that tab (save/close the right one, not the active one).

---

## Review Log

### 2026-06-13 — Phase Review: APPROVED

**Tasks**: 6/6 genuinely complete (0 stubs)
**Quality**: PASS — check / typecheck / test (36) / build all green
**Integration**: connected — `closeTab`/`removeTab`/`saveTab`/`confirmClose*` ← TabBar (×) + App (close dialog). E2 switch-guard removed from `vaultStore`; `editorStore` deleted (grep-confirmed no importers).
**Plan integrity**: OK — Phase 02 (persistence; also retires the now-dead `selectFile`/`restoreLastNote`/`lastNote` and fixes the launch regression), Phase 03 (workspace tests), Phase 04 UAT.
**Commit**: uncommitted (project directive)

**Findings**:
- **Caught + fixed during review**: Sidebar delete of a dirty *open* note called `closeTab` (now dirty-aware) → it would prompt to save a file being deleted, and Save would recreate it. Switched delete to `removeTab` (force, no prompt).
- Non-active dirty tab close verified: `saveTab(path)` saves from the store draft (mirrored even when the tab isn't the active view), so closing a background dirty tab saves the right buffer.
- `confirmCloseSave` aborts the close if the write fails — no silent discard of unsaved edits.
- Tests dropped 44→36 with `editorStore.test.ts` removal; Phase 03 restores coverage with `workspaceStore` tests.
- Transitional (Phase 02): launch still doesn't reopen notes; dead `selectFile`/`restoreLastNote`/`lastNote` paths remain in `vaultStore`.

**Deferred**: None
