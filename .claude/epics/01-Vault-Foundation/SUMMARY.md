# Epic 01: Vault Foundation — Summary

> **Duration**: 2026-05-18 to 2026-06-13
> **Phases**: 5 completed (00–04 implementation + reviewed; 05 UAT signed off)
> **Status**: COMPLETE

---

## Results

The first vertical slice — read + create + delete vault wired end-to-end across all three Electron layers — is live and the full quality gate is green.

- **IPC contract foundation** (`shared/ipc.ts`) — 8 typed `settings:*` / `vault:*` / `dialog:*` commands, every response delivered as `IpcResult<T>`. `notImplemented` stub fully removed.
- **SettingsService** — persists the vault path to `userData/settings.json`; auto-loads on launch.
- **VaultService** — `listNotes` / `readNote` / `writeNote` / `createNote` / `deleteNote` with atomic temp-rename writes and `..`-traversal path safety. 15 unit tests.
- **Renderer shell** — `EmptyState` first-launch picker, recursive `Sidebar` tree (filters to `.md`/`.markdown`/`.txt`, hides `_*` and `.*`), read-only `ContentPane`, `ConfirmDialog`, Zustand `vaultStore`, New/Delete/Refresh actions, and a **Change-vault-folder** button added during UAT.

### Success Criteria (VISION §4)

| # | Criterion | Result | Evidence |
|---|-----------|--------|----------|
| 1 | Fresh-launch empty state | PASS | UAT scenario 1 |
| 2 | Folder picker persists across restart | PASS | UAT scenarios 2, 3 (KOTLİN vault auto-reopened) |
| 3 | Tree lists `.md/.markdown/.txt`, hides `_*`/`.*` | PASS | VaultService unit tests + scenario 2 |
| 4 | Click file → raw content | PASS | UAT scenario 4 (post BUG-01) |
| 5 | New Note creates + selects empty file | PASS | UAT scenario 5 |
| 6 | Delete (with confirm) removes from tree + disk | PASS | UAT scenario 6 |
| 7 | Path safety: `..` rejected | PASS | VaultService unit test |
| 8 | Atomic write crash-safe | PASS | VaultService unit test (Phase 04) |
| 9 | Lint + typecheck + build green | PASS | Full gate re-run at close: check / typecheck / test (20) / build all exit 0 |

---

## Learnings

### What Worked
- **Locking the IPC contract shape at Phase 00** (all commands stubbed with `notImplemented`) let later phases wire real services without touching signatures — the linear plan held with no contract churn.
- **Services-throw / IPC-catches / renderer-destructures-`result.ok`** kept error handling uniform across every command.
- **Surfacing already-built capability instead of new scope**: the UAT folder-re-picker was a 3-line button over the existing `pickAndSetVault` action, not E8 work.

### What Didn't Work
- **BUG-01 (blank white screen)**: `react-resizable-panels` injects inline `height:100%` that needs a height chain on `html/body/#root`; the missing CSS collapsed the layout. Caught only in UAT, not in any automated check — layout/height bugs are invisible to typecheck/lint/build.
- **Over-aggressive scope deferral**: deferring *all* folder re-selection to E8 made the app unusable on first real run without hand-editing `settings.json`. The minimal re-picker had to be pulled forward during UAT.

### For Future Epics
- Add a lightweight runtime smoke check (does the window render non-blank?) — the automated gate cannot catch CSS layout collapse.
- When deferring a capability, sanity-check that the epic is still *usable* without it; "persistence works" is not the same as "the user can change their choice."
- E02 will refactor the IPC contract when the chokidar watcher introduces write/watch coordination — expected, flagged in PLANNING.md.

---

## Deferred Items

| Item | Reason | Follow-up |
|------|--------|-----------|
| chokidar watcher / live external-change detection | Coordination need only arises with editor saves | E02 — Editor Core MVP |
| CodeMirror 6 editor, save-on-edit, dirty tracking | No editing in E01 (read-only `<pre>`) | E02 — Editor Core MVP |
| Full Settings UI | Only the minimal folder re-picker was pulled in; full settings screen still out of scope | E08 — Settings UI |
| File/folder rename, move, folder create/delete | Not needed for E01 acceptance | Later epic |
| Stray `.tmp-*` cleanup after interrupted writes | Residue accepted for v1 | Later epic |
| Sidebar sort/order controls | Default filesystem/alpha order acceptable | Defer until needed |
| UAT scenarios 7 (Escape-cancel) & 8 (Refresh) runtime observation | Accepted on code-verification basis at user direction; not runtime-observed | Re-verify opportunistically during E02 manual testing |

---

## Note on Commits

Per standing project directive ("no commits until the project is ready"), Epic 01 closes **uncommitted** — all phases, design docs, and implementation remain in the working tree. The first commit awaits an explicit user request.
