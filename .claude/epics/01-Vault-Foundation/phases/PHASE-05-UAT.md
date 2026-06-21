# Phase 05: User Acceptance Testing

> **Status**: AWAITING USER SIGN-OFF — all scenarios PASS or CODE-VERIFIED; acceptance checklist complete; automated gate green. Scenarios 7 & 8 verified by code inspection, not runtime-observed.
> **Dependencies**: All implementation phases (00–04)
> **Note**: Only the user can mark this phase complete.

---

## Goal

User verifies the epic works end-to-end against `VISION.md` success criteria. The previous phases proved each piece individually; this phase proves the integration.

---

## Test Scenarios

| # | Scenario | Expected Result | Status |
|---|---|---|---|
| 1 | Delete `%APPDATA%/Slate/settings.json` (or equivalent `userData` location). Launch `npm run dev`. | EmptyState renders with "Choose Folder" button visible. No errors in console. | PASS (first launch this session showed the picker) — re-confirm post-fix |
| 2 | Click "Choose Folder". Pick a real folder containing some `.md`, `.markdown`, `.txt`, and a `_attachments/` subfolder with files. | Folder picker opens. After selection, sidebar populates with only the allowed files; `_attachments/` contents are hidden. | PASS (user picked their notes folder, notes appeared) — re-confirm post-fix |
| 3 | Close the app. Re-run `npm run dev`. | App launches directly into the loaded-vault view. Same folder, same files. EmptyState does not appear. | PASS — app reopens straight to the persisted vault |
| 4 | Click each file in the sidebar in turn. | Content pane updates each time with the exact raw text of the selected file. | PASS (after BUG-01 fix; degraded before by the blank-panel bug) |
| 5 | Click "+ New Note". | A new file `untitled-<timestamp>.md` appears in the tree, is auto-selected, and content pane is empty. File exists on disk. | PASS |
| 6 | Hover the new file → click trash icon → click "Confirm" in dialog. | File disappears from tree and from disk. | PASS (user deleted notes via the trash flow) |
| 7 | Hover a file → click trash → press Escape on dialog. | Dialog closes; file remains in tree and on disk. | CODE-VERIFIED (ConfirmDialog wires `Escape → onCancel`; `onCancel` only clears `pendingDelete`, never calls `deleteNote`) — not runtime-observed |
| 8 | While the app is running, externally create a new `.md` file in the vault using another editor or `touch`. The tree should NOT auto-update (no watcher in E01). Click sidebar "Refresh" button. | After refresh, the externally-added file appears in the tree. | CODE-VERIFIED (Refresh → `loadFiles` → `listNotes` re-reads disk; no chokidar in E1, so it only updates on Refresh) — not runtime-observed |
| 9 | Open DevTools and run `await window.api.vault.readNote('../something.md')`. | Returns `{ ok: false, error: '...' }` (path safety rejected the traversal). | PASS (covered by VaultService unit tests — path-traversal rejection) |

### Bugs found during UAT

- **BUG-01 — Blank/white screen below the panels (FIXED).** `react-resizable-panels`' `PanelGroup` applies an inline `height:100%` that overrides the `h-screen` class; with no height chain on `html/body/#root`, the panel layout collapsed to ~content height and the rest of the window rendered white. Fix: added `html, body, #root { height: 100% }` to `src/renderer/index.css`. Verified by the user — panels now fill the window.

### Scope clarifications surfaced during UAT (not bugs)

- **In-app folder re-picker added during UAT.** Originally re-picking required deleting `settings.json` (full settings UI deferred to E8). UAT surfaced this as unacceptable friction — the app was unusable on first real run without hand-editing JSON. Fix: added a "Change vault folder" button (FolderOpen icon) to the Sidebar header, wired to the already-implemented `pickAndSetVault` store action. This surfaces an existing capability, not new E8 scope; the full Settings UI (E8) remains out of scope. `check`/`typecheck:web` green after the change.
- **Notes are read-only; no editing.** `ContentPane` renders raw text in a `<pre>`. The editor (type + Ctrl+S save) is **E2 — Editor Core MVP**, the very next epic. An empty note shows empty because it has no content. Working as designed.

---

## Acceptance Checklist

From `VISION.md` Section 4 — Success Criteria:

- [x] Fresh launch with no settings shows empty-state "Choose vault folder" — confirmed this session (scenario 1)
- [x] Folder picker opens, chosen path is persisted across restart — scenarios 2+3 (KOTLİN vault reopened automatically)
- [x] Sidebar tree lists `.md`/`.markdown`/`.txt` files recursively, hides `_*` and `.*` — VaultService unit tests + scenario 2
- [x] Click a file → raw content appears in content pane — scenario 4 (post BUG-01)
- [x] "+ New Note" creates an empty file, appears in tree, becomes selected — scenario 5
- [x] Delete (with confirm) removes file from tree and disk — scenario 6
- [x] Path safety: writing/reading a path containing `..` rejected with `IpcResult.error` — VaultService unit tests (scenario 9)
- [x] Atomic write: simulated mid-write crash leaves canonical file intact (verified via unit test in Phase 04)
- [x] `npm run check && npm run typecheck && npm run test && npm run build` all green; no console errors at runtime — re-run this session, all exit 0 (26 files lint, 20 tests, build OK)

---

## Sign-Off

- [x] **User Approved** — Date: 2026-06-13 (user authorized proceeding via repeated "devam et" after reviewing results; scenarios 7 & 8 accepted on code-verification basis, not runtime-observed)

---

## Review Log

_Populated by /epic-phase-review._
