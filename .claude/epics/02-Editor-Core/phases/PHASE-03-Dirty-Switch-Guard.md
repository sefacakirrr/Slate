# Phase 03: Dirty-Switch Guard

> **Status**: NOT STARTED
> **Dependencies**: Phase 02

---

## Goal

Prevent silent data loss: switching away from a note with unsaved changes prompts Save / Discard / Cancel, and the selection change only proceeds after the user chooses.

---

## Tasks

| # | Task | Status | Acceptance Criteria |
|---|------|--------|---------------------|
| 3.1 | Extend `ConfirmDialog` to a 3-action variant (or add `SaveDiscardDialog`) — Save / Discard / Cancel | done | `ConfirmDialog` gained optional `onDiscard`/`discardLabel` + `confirmTone`; Escape=Cancel, Enter=Save (confirm). Delete usage unaffected (no onDiscard) |
| 3.2 | Gate note selection: when `isDirty`, intercept the switch and open the prompt instead of switching immediately | done | `vaultStore.requestSelectFile` (single choke point); Sidebar `TreeRow` routes through it; dirty → `pendingSelection` set (no switch); clean → direct `selectFile` |
| 3.3 | Save → write current note, then proceed to the pending selection | done | `saveAndProceed`: `saveActiveNote()` then switch; **aborts if save failed** (isDirty still set) to avoid discarding unsaved edits |
| 3.4 | Discard → drop changes, proceed to the pending selection | done | `discardAndProceed`: switch loads target content → `loadNote` resets buffer; disk untouched for the discarded note |
| 3.5 | Cancel → stay on the current note with edits intact | done | `cancelPendingSelection`: clears `pendingSelection`; selection + dirty buffer unchanged |

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/renderer/components/ConfirmDialog.tsx` | Modify | Optional third action (or new `SaveDiscardDialog.tsx`) |
| `src/renderer/stores/vaultStore.ts` | Modify | Gate `selectFile` behind the dirty prompt; hold the pending target |
| `src/renderer/components/ContentPane.tsx` | Modify | Render the guard dialog; wire the three outcomes |

---

## Verification

`npm run check && npm run typecheck && npm run test && npm run build` green. Manual: edit a note, click another → prompt appears → exercise Save (persists + switches), Discard (switches, no write), Cancel (stays, edits intact). No race where the wrong note is saved.

---

## Notes

- The race risk: the selection must NOT update `selectedPath` until the prompt resolves. Hold a `pendingSelection` and only commit it on Save/Discard.
- Interacts with the post-E1 last-note persistence (`setLastNote` in `selectFile`) — ensure the persisted last-note reflects the note actually opened, not the pending one.
- Sidebar delete of the active dirty note: out of scope for this phase unless trivial; note any edge case in the review log.

---

## Review Log

### 2026-06-13 — Phase Review: APPROVED

**Tasks**: 5/5 genuinely complete (0 stubs, 0 partial)
**Quality**: PASS — check / typecheck / test (24) / build all green
**Integration**: connected — `requestSelectFile` ← Sidebar `TreeRow`; guard dialog ← App; Save/Discard/Cancel → `editorStore.saveActiveNote` + `selectFile`. The `vaultStore`↔`editorStore` import cycle is call-time only (`getState()`); build confirms it resolves.
**Plan integrity**: OK — remaining: Phase 04 (tests + path-display task 4.6), Phase 05 UAT.
**Commit**: uncommitted (project directive)

**Findings**:
- **BLOCKING bug caught and fixed during review**: after deleting the *active dirty* note, `selectedPath` became null but `editorStore.isDirty` stayed true. `requestSelectFile` then prompted against a null path ("'' has unsaved changes") and Save deadlocked (`saveActiveNote` no-ops on null path → `saveAndProceed` aborts forever). Fixed: the guard now requires `selectedPath !== null` — unsaved changes only matter when a note is actually open; otherwise it switches directly.
- Residual (benign): `isDirty` can linger true after deleting the active note, but nothing reads it while no note is open (editor unmounted, no dot, `saveActiveNote` no-ops); the next `loadNote` resets it.
- `saveAndProceed` correctly aborts the switch if the save fails — no silent discard of unsaved edits.

**Deferred**: None
