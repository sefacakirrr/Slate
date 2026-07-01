# Phase 00: Update Service + IPC (main)

> **Status**: COMPLETE (reviewed 2026-07-01)
> **Dependencies**: None

---

## Goal

Main-process update engine with a clean platform split: Windows drives `electron-updater` (check → download → install); macOS does a signing-independent GitHub Releases version check and opens the Releases page. All outcomes reach the renderer through a single `update:state` event stream. No UI yet.

---

## Tasks

| # | Task | Status | Acceptance Criteria |
|---|------|--------|-------------------|
| 0.1 | `semverGt(a, b)` helper (strip leading `v`, numeric compare major/minor/patch) + unit tests | done | `semverGt('0.2.0','0.1.9')===true`, `semverGt('0.1.9','0.1.9')===false`, handles `v` prefix; tested |
| 0.2 | `UpdateService` (main): `check()` — **win**: `autoUpdater.checkForUpdates()` with event wiring; **mac**: `fetch` `releases/latest`, compare `tag_name` vs `app.getVersion()`, resolve to a state. Guard `app.isPackaged` (else emit `dev-disabled`) | done | On win, checking→(available→downloading→downloaded \| up-to-date \| error); on mac, checking→(available{url} \| up-to-date \| error); dev → dev-disabled |
| 0.3 | Emit a single `update:state` event to the renderer for every transition: `{ status, version?, percent?, url?, error? }` (statuses: `dev-disabled\|checking\|up-to-date\|available\|downloading\|downloaded\|error`) | done | Renderer receives one typed event per transition |
| 0.4 | IPC commands: `update:check` (trigger), `update:install` (win → `autoUpdater.quitAndInstall()`), `update:openReleases` (mac → `shell.openExternal(url)`); mirrored in preload + `Api` incl. `onUpdateState(cb)` | done | Renderer can trigger a check, install (win), open Releases (mac), and subscribe to state |
| 0.5 | Wire `UpdateService` in `main/index.ts`; decide the existing launch `checkForUpdatesAndNotify` (keep as-is or route through the service) | done | App launches; manual check works independently of the launch check |
| 0.6 | Error hardening: offline / GitHub API failure / 429 / non-packaged all resolve to a clear `error` or `dev-disabled` state, never an unhandled throw | done | Check offline → `error` state with a message, no crash |

**Status values**: pending → in_progress → done

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/main/services/UpdateService.ts` | Create | platform-split check/install/open-releases + event emission |
| `src/main/services/UpdateService.test.ts` | Create | `semverGt` unit tests (the pure, testable piece) |
| `src/shared/ipc.ts` | Modify | `update:check` / `update:install` / `update:openReleases` commands + `onUpdateState` in `Api` |
| `src/main/ipc/handlers.ts` | Modify | wire the three update commands to `UpdateService` |
| `src/preload/index.ts` | Modify | expose `update.*` + `onUpdateState` |
| `src/main/index.ts` | Modify | construct `UpdateService`, inject; reconcile the launch check |

---

## Verification

- `npm run test` green (`semverGt` tests); `npm run typecheck` + `npm run build` clean.
- Manual (dev): `update:check` → renderer receives a `dev-disabled` state (real check needs a packaged build).
- Code read: mac path never references `autoUpdater`; win path never references the GitHub API fetch.

---

## Notes

- **macOS avoids `autoUpdater` entirely** — unsigned mac throws / can't install. Use `net`/`fetch` to `https://api.github.com/repos/sefacakirrr/Slate/releases/latest`, read `tag_name`, `semverGt` vs `app.getVersion()`, and on available emit `{status:'available', version, url: release.html_url}`.
- Windows `electron-updater` auto-downloads by default; forward `checking-for-update`, `update-available`, `download-progress` (percent), `update-downloaded`, `error` to `update:state`.
- `update:check` is fire-and-forget from the UI's perspective — the result arrives via events. It may still return a synchronous ack (e.g. `{started:true}`).
- Keep `UpdateService` free of renderer imports; it takes a `send(state)` callback (or the WindowManager) to emit.
- Real end-to-end only works in packaged builds published to GitHub Releases — P02 UAT.

---

## Review Log

### 2026-07-01 — Phase Review: APPROVED

**Tasks**: 6/6 genuinely complete — `UpdateService` (platform split, `app.isPackaged` guard, `emit`-based `update:state` stream); `semverGt` (4 tests); IPC `update:check`/`install`/`openReleases` handled + registered; preload `api.update` incl. `onState`; wired in `main/index.ts` with a `send`-to-main-window emitter.
**Quality**: PASS — full suite 227/227 (+4 semverGt); typecheck (node+web) clean; `npm run build` clean; `UpdateService` biome-clean. The single `main/index.ts` format diff is the pre-existing autoUpdater block (baseline, untouched).
**Integration**: IPC reachable end to end (handlers → service → emit → renderer via `update:state`); `deps.update` injected. The UI consumer is P01 (by design).
**Plan integrity**: OK — P01 (Settings UI) + P02 (UAT) cover the rest. No gaps.
**Commit**: none (user directive: skip commits this session)

**Adversarial audit — verified, no defect**:
- **Windows listeners don't accumulate**: `winWired` guard adds `autoUpdater.on(...)` once across repeated checks.
- **macOS never touches `autoUpdater`**: `checkMac()` uses `fetch` + `semverGt` only — signing-independent, as required.
- **Error paths covered**: non-packaged → `dev-disabled`; mac fetch non-200/throw → `error`; win `checkForUpdates().catch` → `error`. No unhandled throw.
- **`checkForUpdates()` suffices on win**: `autoUpdater.autoDownload` defaults true → download proceeds → `download-progress`/`update-downloaded` fire.

**Notes (non-blocking)**:
- The pre-existing launch `autoUpdater.checkForUpdatesAndNotify()` still runs on mac (packaged) and will log a benign signing error there — left as-is (predates this epic; not in scope).
- Only `semverGt` is unit-testable; the `autoUpdater`/`app`/`shell`/`fetch` paths are verified by build + P02 UAT (packaged-only), consistent with the project's testing approach.
- **For P01**: Windows `available` carries no `url` (it auto-downloads → `downloading`); macOS `available` carries `url` (open Releases). The UI should branch on `state.url` presence (or `api.platform`) to choose the "restart to install" vs "open Releases" affordance.
