# Epic 02: Editor Core MVP — Planning

> Phase structure, dependencies, and progress tracking.
>
> **Status**: COMPLETE
> **Closed**: 2026-06-13

---

## Phase Overview

| Phase | Name | Goal | Dependencies | Status | Progress | Reviewed | Commit |
|---|---|---|---|---|---|---|---|
| 00 | Editor Mount & Doc Lifecycle | Replace `<pre>` with a CM6 `EditorView`; load selected note, swap doc on switch, clean teardown | None | COMPLETE | 6/6 | ✓ | uncommitted |
| 01 | Language Modes & Code Highlighting | markdown mode for `.md`/`.markdown`, plain for `.txt`; fenced code-block highlighting via `@codemirror/language-data` | Phase 00 | COMPLETE | 4/4 | ✓ | uncommitted |
| 02 | Save & Dirty Tracking | `Ctrl+S` → `vault:writeNote`; dirty flag set on edit, cleared on save; visible indicator | Phase 01 | COMPLETE | 6/6 | ✓ | uncommitted |
| 03 | Dirty-Switch Guard | Switching away from an unsaved note prompts Save / Discard / Cancel and gates the selection change | Phase 02 | COMPLETE | 5/5 | ✓ | uncommitted |
| 04 | Tests & Polish | Unit tests for pure logic (language-by-path, dirty/save reducer); debug removed; gate green; full on-disk path shown | Phase 03 | COMPLETE | 6/6 | ✓ | uncommitted |
| 05 | User Acceptance Testing | User verifies write→save→persist end-to-end against VISION success criteria | All phases | NOT STARTED | 0/7 | | |

**Status values**: NOT STARTED → IN PROGRESS → COMPLETE
**Reviewed**: Set only by /epic-phase-review (mandatory before COMPLETE)
**Commit**: Implementation commit hash (7 chars) — note: project directive is "no commits until ready", so this column reads "uncommitted" throughout, as in E1.

---

## Critical Path

```
Phase 00 (Editor Mount)
   ↓
Phase 01 (Languages & Highlighting)
   ↓
Phase 02 (Save & Dirty)
   ↓
Phase 03 (Dirty-Switch Guard)
   ↓
Phase 04 (Tests & Polish)
   ↓
Phase 05 (UAT)
```

Strictly linear. The riskiest piece — CM6's imperative `EditorView` lifecycle in React — is isolated in Phase 00 and validated before any language or save complexity is layered on. Save (Phase 02) depends only on correct doc lifecycle, not on highlighting (Phase 01), but Phase 01 is cheap and keeps the editor visually correct before save semantics arrive.

---

## Key Decisions (from /epic-create dialogue)

- **Source mode, not WYSIWYG.** Markdown markers visible + highlighted. Live-preview deferred.
- **Manual `Ctrl+S` + dirty indicator.** No autosave (E8).
- **Dirty-switch → Save / Discard / Cancel** (reuse/extend `ConfirmDialog`).
- **`@codemirror/language-data`** for code-block languages (new dependency, added in Phase 00 or 01).
- **`vault:writeNote` already exists** (E1) — save needs only renderer wiring, no IPC/contract change.
- **Watcher, tabs, interactive checklists, notes-list view, folder management are OUT** — backlog items.

---

## Reused / Touched From E1

- `src/renderer/components/ContentPane.tsx` — keeps selection/error/empty states as the shell; mounts `EditorHost` when a note loads.
- `src/renderer/stores/vaultStore.ts` — `selectFile`/`selectedPath`/`noteContent` already exist; Phase 03 gates `selectFile` behind the dirty prompt. Last-note persistence (added post-E1) stays intact.
- `api.vault.writeNote` — wired end-to-end, currently uncalled.
