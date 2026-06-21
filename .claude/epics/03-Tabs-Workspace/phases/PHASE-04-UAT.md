# Phase 04: User Acceptance Testing

> **Status**: NOT STARTED
> **Dependencies**: All implementation phases (00–03)
> **Note**: Only the user can mark this phase complete.

---

## Goal

User verifies the multi-tab workspace end-to-end against the VISION success criteria.

---

## Test Scenarios

| # | Scenario | Expected Result | Status |
|---|----------|-----------------|--------|
| 1 | Click three different notes in the sidebar | Three tabs open; the last-clicked is active and highlighted | PASS |
| 2 | Edit + scroll in tab A, switch to B, switch back to A | A's text, cursor position, scroll, and undo history are intact | PASS (after bugfix — see UAT Findings) |
| 3 | Edit A and B without saving | Both tab chips show a dirty dot, independently | PASS |
| 4 | Focus A, press Ctrl+S | Only A is saved (clean); B stays dirty; A persists on disk | PASS |
| 5 | Click × on a dirty tab | Save / Discard / Cancel prompt appears | PASS |
| 6 | Prompt → Discard | Tab closes; that note's file on disk is unchanged | PASS |
| 7 | Prompt → Save | Tab saves then closes | PASS |
| 8 | Close the active tab; then close all tabs | Focus moves to a neighbor; closing the last tab shows the empty state | PASS |
| 9 | Open 3 tabs, restart the app | The 3 tabs + active tab are restored; a note deleted externally before restart is dropped silently | PASS |

---

## Acceptance Checklist

From VISION.md Section 4 — Success Criteria:

- [x] Opening notes creates tabs; active tab highlighted
- [x] Switching tabs preserves content, cursor, scroll, undo per tab *(fixed during UAT — see Findings)*
- [x] Each tab has independent dirty state
- [x] Ctrl+S saves only the active tab
- [x] Closing a dirty tab prompts Save/Discard/Cancel and behaves correctly
- [x] Closing active tab activates a neighbor; last close → empty state
- [x] Sidebar click opens/focuses a tab with NO switch prompt
- [x] Open tabs + active restored on relaunch; missing files dropped
- [x] `npm run check && npm run typecheck && npm run test && npm run build` green; no console errors

---

## Sign-Off

- [x] **User Approved** — Date: 2026-06-14 (verbal: "böyle doğru o zaman devam edelim")

---

## UAT Findings

### 2026-06-14 — BUG (fixed): switching tabs lost edits + cursor/scroll/undo

**Symptom**: With 3 tabs open, text typed in a tab disappeared from the editor after switching away and back (Scenario 2). Cursor/scroll/undo were also lost.

**Root cause**: `EditorHost.tsx` stored each tab's `EditorState` in `statesRef` only on *first* activation. CodeMirror produces a new immutable `EditorState` on every keystroke (held in `view.state`), but the map kept the stale first-activation state. The outgoing tab's live `view.state` was never written back before `view.setState(incoming)`, so returning to a tab restored its initial state. (The text itself survived in the store's `draft` via `onDocChange`, so no disk data loss — but the editor showed stale content and lost cursor/scroll/undo.)

**Fix**: Added an effect cleanup in the activate effect that persists the outgoing tab's `view.state` back into `statesRef` before the next activation (and on unmount). Standard CM6 multi-document pattern. Gate re-run green (check/typecheck/test 68/build). User re-verified Scenario 2 PASS.

**Note**: This is Phase 00 code (per-tab editor state) — the class of bug unit tests can't reach (no DOM), which is exactly what this UAT phase exists to catch.

### 2026-06-14 — Quit-with-dirty behavior (accepted as-is for v1)

**Observed**: Closing the whole app while a tab is dirty discards the unsaved edits silently — no prompt (`main/index.ts` has no `before-quit`/`close` guard; `window-all-closed → app.quit()`), and on relaunch the tab reopens CLEAN with on-disk content (drafts aren't persisted; `persistWorkspace` stores only `{openTabs, activeTab}`).

**Decision**: Out of E3's defined scope — the dirty prompt covers tab CLOSE, not app QUIT; "save all" was explicitly out of scope. User accepted the current behavior for v1 after the data-loss risk was flagged. **Deferred**: a quit-with-dirty guard (Save / Quit anyway / Cancel) is tracked in `.claude/backlog/tasks.md` (UAT-driven, 2026-06-14, [feature] high).

---

## Review Log

_Populated by /epic-phase-review._
