# Epic 03: Tabs & Workspace

> **Status**: Planning
> **Created**: 2026-06-13

---

## 1. Summary

**Problem**: Only one note can be open at a time. The whole app is built around a single active note (`vaultStore.selectedPath` + a single-note `editorStore`), so working across several notes means constant switching — and every switch triggers a Save/Discard/Cancel prompt (E2 Phase 03). The user wants Obsidian/Sublime-style tabs.

**Vision**: Multiple notes open as tabs. Each tab keeps its own content, dirty state, and editor state (cursor/scroll/undo). Switching tabs is instant and lossless. `Ctrl+S` saves the active tab. The Save/Discard/Cancel prompt moves to **closing** a dirty tab (switching is free). Open tabs + the active tab are restored on next launch.

**Key Deliverables**:
1. **`workspaceStore`** — ordered list of open tabs + active tab; open / activate / close actions.
2. **Per-tab editor state** — one CM6 `EditorState` per open tab, swapped into the single `EditorView` on activate (preserves cursor/scroll/undo); per-tab dirty.
3. **Tab bar UI** — above the editor: active highlight, per-tab dirty dot, per-tab close (×).
4. **Close-with-dirty prompt** — closing an unsaved tab prompts Save / Discard / Cancel.
5. **Tab persistence** — open tab paths + active tab saved and restored on launch (replaces E2's single-note last-note restore).

---

## 2. Exploration Findings

> Codebase reviewed 2026-06-13 via /epic-create (direct inspection — author implemented E1 + E2).

### Relevant Components (current single-note model)
- **`stores/vaultStore.ts`** — `selectedPath`, `noteContent`, `selectFile` / `requestSelectFile` (dirty-switch gate) / `pendingSelection` / `saveAndProceed` / `discardAndProceed` / `cancelPendingSelection`, and `lastNotePath` persistence (`restoreLastNote`). All assume exactly one active note.
- **`stores/editorStore.ts`** — single note's `draft` / `baseline` / `isDirty` / `saving`; `loadNote` / `setDraft` / `saveActiveNote`. **One note only.**
- **`editor/EditorHost.tsx`** — one long-lived `EditorView`; doc swap on `content` change, language reconfigure on `path` change, `updateListener` → dirty, `Ctrl+S` → save.
- **`components/ContentPane.tsx`** — shell (no-selection / read-error / loaded) + path header + dirty dot + `EditorHost`.
- **`App.tsx`** — layout (`react-resizable-panels`, already in place) + the dirty-switch `ConfirmDialog`.
- **`components/Sidebar.tsx`** — `TreeRow` click → `requestSelectFile` (the gate that prompts on dirty switch).
- **IPC / SettingsService** — `settings:getLastNote` / `setLastNote` persist a single path; this generalizes to a tab set.

### Gaps Identified
- No concept of multiple open notes; no tab list, no per-tab state.
- `editorStore` holds one note's buffer — tabs need per-tab buffers/dirty/editor state.
- The dirty-switch-on-selection guard is the wrong model for tabs (switching should be free; the prompt belongs on close).
- Persistence stores one note; needs to store a tab set + active tab.

### Patterns to Follow
- Renderer-only feature; no new main-process logic except generalizing the persisted "last note" → "open tabs + active". Reuse `vault:writeNote` / `readNote`.
- Keep the single `EditorView`; manage per-tab `EditorState` objects (CM6-idiomatic). Don't mount a view per tab.
- Stores stay Zustand; cross-store `getState()` (as `vaultStore`↔`editorStore` already do) is acceptable.
- Errors via `IpcResult`; no contract change expected beyond the persistence shape.

---

## 3. Architecture

### Current State (single note)
```
Sidebar click → vaultStore.requestSelectFile → (dirty? prompt) → selectFile
   → noteContent → ContentPane → EditorHost (1 view, 1 doc)
editorStore: one note's draft/baseline/isDirty
persistence: settings lastNotePath (one note)
```

### Target State (tabs)
```
workspaceStore: tabs: [{ path }], activeTabPath
   ├─ openTab(path)      → add (or focus existing), activate
   ├─ activateTab(path)  → swap the active EditorState into the view
   └─ closeTab(path)     → (dirty? Save/Discard/Cancel) → remove, activate neighbor

Sidebar click → workspaceStore.openTab(path)   (no switch prompt)

EditorHost (single EditorView)
   ├─ per-tab EditorState map: path → EditorState (doc + cursor + scroll + history)
   ├─ activate → view.setState(stateForTab)      (lossless switch)
   ├─ updateListener → per-tab dirty (draft vs baseline)
   └─ Ctrl+S → save the ACTIVE tab via vault:writeNote

Tab bar (above editor) → one chip per tab: name, dirty dot, × close

persistence: settings → { openTabs: string[], activeTab: string|null }
   restored on launch (missing files skipped); replaces lastNotePath
```

### Reworked from E2
- `vaultStore.requestSelectFile` / `pendingSelection` / `saveAndProceed` / `discardAndProceed` (the switch-time prompt) are **retired or repurposed** — sidebar selection becomes `openTab`. The Save/Discard/Cancel `ConfirmDialog` moves from App's switch-guard to the tab-close flow.
- `editorStore` (single) is **absorbed into the per-tab model** (either generalized to keyed-by-path state inside `workspaceStore`, or kept as the active-tab projection). Decided in `/epic-plan`.
- `restoreLastNote` / `lastNotePath` → `restoreWorkspace` / `{openTabs, activeTab}`.

---

## 4. Success Criteria

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | Opening 3 notes shows 3 tabs; the active one is highlighted | Manual: click 3 notes, see 3 tabs |
| 2 | Switching tabs preserves each tab's content, cursor, scroll, and undo history | Manual: edit/scroll in A, switch to B and back — A's cursor/scroll/undo intact |
| 3 | Each tab tracks its own dirty state independently | Manual: edit A and B; both show dirty dots; saving A leaves B dirty |
| 4 | `Ctrl+S` saves only the active tab | Manual: edit A+B, focus A, Ctrl+S — A clean on disk, B unchanged |
| 5 | Closing a dirty tab prompts Save / Discard / Cancel and behaves correctly for each | Manual: exercise all three on a dirty tab |
| 6 | Closing the active tab activates a neighbor; closing the last tab returns to the empty state | Manual: close tabs down to zero |
| 7 | Clicking a sidebar note opens it in a tab (or focuses the existing tab) with NO switch prompt | Manual: click around the sidebar with a dirty tab open — no prompt |
| 8 | Open tabs + active tab are restored on relaunch; files deleted meanwhile are dropped silently | Manual: open 3 tabs, restart, see them; delete one externally, restart, it's gone |
| 9 | `npm run check && npm run typecheck && npm run test && npm run build` green; no runtime console errors | Automated gate |

---

## 5. Scope

### In Scope
- `workspaceStore` (tabs + active tab; open/activate/close)
- Per-tab CM6 `EditorState` (cursor/scroll/undo preserved); single `EditorView`
- Per-tab dirty tracking + dirty dot per tab
- Tab bar UI (active highlight, dirty dot, × close)
- Close-with-dirty Save/Discard/Cancel prompt
- `Ctrl+S` saves the active tab
- Tab persistence (open tabs + active) restored on launch; generalize the `settings` last-note persistence to a tab set
- Rework of E2's dirty-switch guard (sidebar selection → openTab; prompt relocates to close)

### Out of Scope (deferred)
- **Tab reordering / drag-and-drop** — later; default is open-order.
- **Split panes / multiple editor groups** — later epic if ever.
- **Pinned tabs / VSCode-style preview (peek) tabs** — explicitly cut for MVP (decided in dialogue).
- **Tab overflow chrome** beyond basic horizontal scroll — acceptable rough edge for v1.
- **"Save all" / save-on-close-all** — only per-active-tab save + close prompt.
- **Watcher, search, attachments, etc.** — their own epics.

---

## 6. Risks & Open Questions

| Risk | Impact | Mitigation |
|------|--------|------------|
| Refactoring the single-note model (`editorStore`, `vaultStore` selection/guard, persistence) into a multi-tab model without regressing E2's save/dirty/persistence | The riskiest part — touches working, user-verified code | Keep the single `EditorView`; introduce `workspaceStore` and per-tab `EditorState` incrementally; retire the switch-guard only once openTab replaces it; lean on the existing 44-test suite + add workspace tests |
| Managing per-tab CM6 `EditorState` (create on open, store, `view.setState` on activate, attach dirty listener + Ctrl+S keymap consistently to every state) | Lost edits, stale dirty, or a tab showing the wrong buffer | One factory that builds an `EditorState` with the shared extensions (incl. listener/keymap) per tab; activate = `view.setState`; dirty derived from doc vs per-tab baseline |
| Dirty state must live per-tab, but `Ctrl+S`/dirty dot act on the active tab | Saving or flagging the wrong tab | Store per-tab `{ baseline, dirty }` keyed by path in `workspaceStore`; the active tab is just the focused key |
| Persistence races / stale tabs (a persisted tab's file was deleted/renamed externally) | Restore errors or ghost tabs | On restore, filter against `listNotes`/existence; drop missing silently (same approach as E2's last-note guard) |
| Interaction with rename (added post-E2): renaming an open note must update its tab | Tab points at a stale path | `renameNote` updates the matching tab's path + the persisted set |
| Closing the active tab — which neighbor activates? | Confusing focus jumps | Activate the tab to the left, or the next one if it was first; empty state when none remain |
