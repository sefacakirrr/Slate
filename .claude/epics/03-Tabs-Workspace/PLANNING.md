# Epic 03: Tabs & Workspace — Planning

> **Status**: COMPLETE
> **Closed**: 2026-06-14
>
> Phase structure, dependencies, and progress tracking.

---

## Phase Overview

| Phase | Name | Goal | Dependencies | Status | Progress | Reviewed | Commit |
|---|---|---|---|---|---|---|---|
| 00 | Tab Model & Per-Tab Editor State | `workspaceStore` (tabs + active); per-tab CM6 `EditorState` (cursor/scroll/undo preserved); tab bar; per-tab dirty; Ctrl+S saves active tab; sidebar opens tabs | None | COMPLETE | 8/8 | ✓ | uncommitted |
| 01 | Close & Dirty Prompt | Close a tab (× / neighbor activation / empty state); Save/Discard/Cancel on closing a dirty tab; retire E2's switch-guard | Phase 00 | COMPLETE | 6/6 | ✓ | uncommitted |
| 02 | Tab Persistence | Persist `{openTabs, activeTab}` (generalize the single last-note); restore on launch (skip missing); rename updates the open tab | Phase 01 | COMPLETE | 6/6 | ✓ | uncommitted |
| 03 | Tests & Polish | `workspaceStore` unit tests (open/activate/close, per-tab dirty, neighbor pick, persistence shape, rename-tab); remove dead single-note code; gate green | Phase 02 | COMPLETE | 5/5 | ✓ | uncommitted |
| 04 | User Acceptance Testing | User verifies multi-tab workflow end-to-end | All phases | COMPLETE | 9/9 | ✓ | uncommitted |

**Status values**: NOT STARTED → IN PROGRESS → COMPLETE
**Reviewed**: Set only by /epic-phase-review (mandatory before COMPLETE)
**Commit**: project directive is "no commits until ready" — reads "uncommitted" throughout, as in E1/E2.

---

## Critical Path

```
Phase 00 (Tab model + per-tab editor state)  ← heaviest; the single-note → multi-tab refactor
   ↓
Phase 01 (Close + dirty prompt; retire E2 switch-guard)
   ↓
Phase 02 (Persistence; rename↔tab)
   ↓
Phase 03 (Tests & polish)
   ↓
Phase 04 (UAT)
```

Strictly linear. Phase 00 carries the architectural risk (per-tab CM6 `EditorState`, retiring `selectedPath`-driven rendering). Later phases are lighter and additive.

---

## Key Decisions (from /epic-create dialogue)

- **Per-tab CM6 `EditorState`** — switching tabs preserves cursor / scroll / undo (not a simple doc-swap).
- **Dirty prompt on tab CLOSE, not on switch** — switching is free; E2's `requestSelectFile`/`pendingSelection` switch-guard is retired.
- **No preview/peek tabs, no pinning** — every opened note is a real tab.
- **Persistence**: restore open tabs + active tab on launch (replaces E2's single `lastNotePath`).

---

## Refactor Map (what E2 code changes)

| E2 element | Fate in E3 |
|---|---|
| `vaultStore.selectedPath` | Superseded by `workspaceStore.activeTabPath` as "what's shown" |
| `vaultStore.requestSelectFile` / `pendingSelection` / `saveAndProceed` / `discardAndProceed` / `cancelPendingSelection` | Retired (Phase 01) — sidebar click → `workspaceStore.openTab` |
| `stores/editorStore.ts` (single-note dirty/save) | Absorbed into `workspaceStore` (per-tab baseline/dirty + `saveActiveTab`); file + its test removed in Phase 00, re-covered in Phase 03 |
| `editor/EditorHost.tsx` (one `EditorState`) | Holds a `Map<path, EditorState>`; `activate` = `view.setState` |
| `settings` last-note (`getLastNote`/`setLastNote`, `restoreLastNote`) | Generalized to `{openTabs, activeTab}` (Phase 02) |
| `vault:writeNote` / `readNote` | Reused unchanged |
| `react-resizable-panels` layout | Reused unchanged |

The existing 44-test suite is the regression net through the refactor.
