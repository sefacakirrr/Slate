# Phase 04: User Acceptance Testing

> **Status**: COMPLETE — user-approved 2026-07-01 (macOS; Windows cross-platform not tested this session)
> **Dependencies**: All implementation phases
> **Note**: Only the user can mark this phase complete.

---

## Goal

User verifies sticky notes work end-to-end and behave correctly across app restarts and (ideally) both platforms.

---

## Test Scenarios

| # | Scenario | Expected Result | Status |
|---|----------|-----------------|--------|
| 1 | Pin a note from the sidebar | A frameless window floats above other apps showing the note; it stays on top when you switch apps | pass |
| 2 | Edit text in the sticky and Cmd/Ctrl+S | Change is saved; opening the same note in the main window shows the edit | pass |
| 3 | Drag and resize the sticky, then quit and relaunch | The sticky reopens at the same position and size | pass |
| 4 | Close a sticky, then relaunch | It does not reappear | pass |
| 5 | Pin the same note twice | The second pin focuses the existing sticky (no duplicate) | pass |
| 6 | Try to pin a locked (`.md.enc`) note | No pin action available (excluded in v1) | pass |
| 7 | Delete a stuck note (or lock it) from the main window | The sticky closes gracefully, no crash | pass |
| 8 | **Sync — sticky → main**: with note A open in a sticky AND in the main window (main not dirty), type in the sticky and wait ~1s (autosave) | The main window's editor updates to match, without a manual save | pass |
| 9 | **Sync — main → sticky**: type in the main window's A tab and Ctrl+S (sticky not dirty) | The sticky updates to match | pass |
| 10 | **Dirty guard**: make edits in BOTH the sticky and the main tab for A, then save one | The other window is NOT overwritten (keeps its own edits) | pass |
| 11 | (If possible) Repeat 1–4 on the other OS (macOS ↔ Windows) | Same behavior | not tested (only macOS this session) |

Scenarios 1–10 verified by the user on macOS, including the tweaks (new sticky opens top-right with inner padding; tab labels hide the `.md`/`.enc` extension). Scenario 11 (Windows) untested.

---

## Acceptance Checklist

- [x] Pinned note opens a floating always-on-top editable window (criterion 1)
- [x] Edits in a sticky save to the vault file (criterion 2)
- [x] Position/size persist and restore across relaunch (criterion 3)
- [x] Unpinned sticky stays closed after relaunch (criterion 4)
- [x] Locked notes cannot be pinned (criterion 5)
- [ ] Works on macOS and Windows (criterion 6) — macOS verified; Windows not tested this session
- [x] Deleting a stuck note closes its sticky gracefully (criterion 7)
- [x] Near-live sync both directions when the other window isn't dirty (scenarios 8–9)
- [x] Dirty window is never clobbered by a sync reload (scenario 10)

---

## Sign-Off

- [x] **User Approved** — Date: 2026-07-01 (macOS; Windows cross-platform deferred)

---

## Review Log

_Populated by /epic-phase-review._
