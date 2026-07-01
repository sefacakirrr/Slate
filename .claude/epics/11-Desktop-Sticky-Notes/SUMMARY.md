# Epic 11: Desktop-Sticky-Notes — Summary

> **Duration**: 2026-07-01 (single session)
> **Phases**: 5 completed (00–03 implementation + 04 UAT)
> **Status**: COMPLETE
> **Baseline**: `45f1cf0` (from VISION.md — revert point)
> **Final**: shipped in the `v0.1.9` release commit

---

## Results

Optional desktop sticky notes with near-live multi-window sync, delivered end to end:

- **Sticky windows** (`WindowManager`): pin a note as a frameless, always-on-top, off-taskbar, resizable window rendering that vault `.md` file. A new sticky opens at the screen's **top-right** corner (work-area, 16px margin) with inner editor padding; geometry (position+size) persists debounced and restores on launch; the app keeps stickies across quit (unpin only on user-close). Locked notes are rejected. `app.on('activate')` reopens the main window even when only stickies are open.
- **Renderer view**: `#/sticky/<path>` route → `StickyNote` on a dedicated `stickyStore` (never the shared `workspaceStore`), reusing the CodeMirror editor core; draggable frameless header + close (saves first).
- **Pin UI + cross-window**: sidebar pin icon on non-locked rows; `broadcastFilesChanged` on every mutation keeps all windows' lists fresh; a sticky closes itself when its note is deleted/renamed/locked elsewhere.
- **Near-live sync (added mid-epic by user request)**: `vault:noteChanged{path}`; sticky debounced autosave (~800ms); a note saved in one window reloads in any other window showing it **only when that window isn't dirty** — both directions (sticky↔main), including the main-window "reload an open tab on external change" behavior that never existed before. Main window stays manual-save.
- **Polish**: tab labels hide the `.md`/`.enc` extension (`note.md` → `note`).

All cross-platform via Electron's own window APIs — zero new dependencies. Mapped to success criteria: all 7 verified (macOS UAT + tests); criterion 6's Windows half not exercised this session.

Final state: `npm run build` ✓, 223 tests ✓, typecheck ✓.

---

## Learnings

### What Worked
- **Quick-capture was a near-perfect template** — frameless window + shared preload + hash route meant a sticky is "another `#/route` on the same bundle," no new window infrastructure.
- **Dedicated `stickyStore` (not `workspaceStore`)** avoided the settings-clobber trap: a sticky reusing the tab store would have overwritten the main window's persisted tabs.
- **Adversarial reviews caught a real regression each phase**: the `activate` dock-reopen break (P00), close-drops-edits (P01), and validated the sync dirty-guard/self-save-no-op interactions (P03) before UAT.
- **One safety rule for sync — "never reload a dirty window"** — kept the near-live feature from ever silently destroying edits.

### What Didn't Work
- **Scope grew mid-epic**: near-live sync was explicitly deferred at planning, then pulled back in as P03 by user request. Handled cleanly via a plan revision, but a reminder that "last-write-wins, no live sync" is a tempting cut that users often want reversed — worth pressure-testing that call earlier.

### For Future Epics
- Multi-window features need the "each renderer has its own store; sync only via IPC + disk" fact stated up front — it shaped every decision here.
- A tiny handler-level test harness would help; the IPC/window layer stays verified by build + UAT only.

---

## Deferred Items

| Item | Reason | Follow-up |
|------|--------|-----------|
| Windows cross-platform verification of stickies (criterion 6) | Only macOS available this session | Verify on a Windows build |
| Per-keystroke live collaboration (CRDT) | Overkill for a single-user local app | Not planned; on-save/autosave reload covers the need |
| Rename/lock of a stuck note drops that sticky's unsaved edits | Accepted last-write-wins limitation (file moved; stale edits shouldn't write to the old path) | Documented; revisit only if it bites |
| In-app update feature | Next epic (E12), agreed this session | `.claude/backlog/tasks.md` (E12 candidate) |

---

## Notes

- Pre-existing lint baseline (Sidebar `useTemplate`/`noNonNullAssertion`/a11y, handlers `useTemplate`, main/index autoUpdater format) predates this epic and was left untouched. E11 code is lint-clean.
- Vision revision (2026-07-01) recorded sticky notes (and the P03 sync expansion) in PROJECT-VISION / TECHSTACK / ARCHITECTURE / ROADMAP / CLAUDE.md.
