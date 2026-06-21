# Phase 02: Save & Dirty Tracking

> **Status**: NOT STARTED
> **Dependencies**: Phase 01

---

## Goal

Make the editor write: `Ctrl+S` persists the buffer to disk via `vault:writeNote`, edits set a visible dirty indicator, and a successful save clears it.

---

## Tasks

| # | Task | Status | Acceptance Criteria |
|---|------|--------|---------------------|
| 2.1 | Add editor/dirty state — `isDirty`, current draft content, and a `saveActiveNote()` action (new `editorStore` or extend `vaultStore`) | done | Dedicated `stores/editorStore.ts` (draft/baseline/isDirty/saving); `saveActiveNote` calls `api.vault.writeNote` + reads `result.ok` |
| 2.2 | CM6 `updateListener` sets dirty when the doc changes from the loaded content | done | `dirtyListener` → `setDraft`; `isDirty = draft !== baseline` |
| 2.3 | `Ctrl+S` keymap in the editor → `saveActiveNote()` with `preventDefault` | done | `keymap` `Mod-s` with `preventDefault: true` → `saveActiveNote()` |
| 2.4 | On successful save, clear dirty and sync the "loaded content" baseline to the saved text | done | On `result.ok`: `baseline = draft`, `isDirty = false`; re-save is a no-op (clean/saving guard) |
| 2.5 | Visible dirty indicator in the `ContentPane` header (e.g. a dot or "●" next to the path) | done | Amber dot (`role="img"`) shown when `isDirty`, hidden when clean |
| 2.6 | Loading a note resets dirty to false and seeds the baseline | done | `EditorHost` content effect calls `loadNote(content)` → baseline+draft=content, dirty false |

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/renderer/stores/editorStore.ts` | Create | Dirty flag, draft, `saveActiveNote()` (or extend `vaultStore`) |
| `src/renderer/editor/EditorHost.tsx` | Modify | `updateListener` (dirty) + `Ctrl+S` keymap → save |
| `src/renderer/components/ContentPane.tsx` | Modify | Dirty indicator in header |

---

## Verification

`npm run check && npm run typecheck && npm run test && npm run build` green. Manual: open note → type → dirty indicator appears → `Ctrl+S` → indicator clears → confirm file on disk changed → reopen shows persisted content.

---

## Notes

- `writeNote` is already wired through service/handler/preload/api from E1 — this phase only adds the renderer caller. No IPC/contract change.
- Save errors: surface via the existing `IpcResult` pattern (e.g. keep dirty + log/notify). Don't silently swallow a failed write.
- Decide store shape early: a dedicated `editorStore` keeps editor concerns out of `vaultStore`; acceptable to extend `vaultStore` if it stays cohesive. Document the choice in the review log.

---

## Review Log

### 2026-06-13 — Phase Review: APPROVED

**Tasks**: 6/6 genuinely complete (0 stubs, 0 partial)
**Quality**: PASS — check / typecheck / test (24) / build all green
**Integration**: connected — `dirtyListener` + `saveKeymap` in the view; `saveActiveNote` ← Ctrl+S keymap; `isDirty` → `ContentPane` header dot; `loadNote` ← `EditorHost`. `editorStore` imports `vaultStore` (one direction, no cycle).
**Plan integrity**: OK — Phase 03 gates `selectFile`; "discard" is automatic via the content swap (`loadNote`), so no new store method is needed. `editorStore` already exposes `isDirty` + `saveActiveNote`.
**Commit**: uncommitted (project directive)

**Findings**:
- **BLOCKING bug caught and fixed during review**: `saveActiveNote` cleared dirty against the *captured* draft, so typing during the async `writeNote` window would falsely clear the dirty dot while edits were still unsaved (data-loss perception). Fixed — dirty is now recomputed against the live `draft` on save success (`isDirty: s.draft !== draft`).
- Cross-note undo guarded in Phase 02: note-load transaction uses `Transaction.addToHistory.of(false)`, so `Ctrl+Z` can't revert into a prior note's text.
- `Ctrl+S` fires only when the editor is focused (CM6 keymap). If focus is elsewhere the OS/Electron default may fire. Acceptable for MVP (editing implies focus); a global app keymap is E7 territory.

**Deferred**: None
