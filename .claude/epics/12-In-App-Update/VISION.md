# Epic 12: In-App Update

> **Status**: Planning
> **Created**: 2026-07-01
> **Baseline**: `26fb852` (revert point if epic is abandoned)
> **Skill**: /epic-create

---

## 1. Summary

**Problem**: There's no way to update Slate from inside the app. Only a silent launch check exists (`autoUpdater.checkForUpdatesAndNotify`), which shows a native notification on Windows and does nothing installable on macOS. To update, the user must manually find the GitHub Releases page.

**Vision**: A "Check for updates" action in Settings. On **Windows** it checks GitHub, downloads, and installs the new version (restart to apply) via `electron-updater`. On **macOS** it detects whether a newer release exists (via the GitHub Releases API — signing-independent) and opens the Releases page to download, since unsigned macOS apps can't self-install updates.

**Key Deliverables**:
1. Main-process update service + IPC: check, per-state events, Windows install, macOS "open Releases".
2. Settings "Updates" section: current version, a check button, and platform-appropriate states/actions.
3. Honest handling of dev / unsupported cases (updates only in packaged builds).

---

## 2. Exploration Findings

> Grounded in this session's investigation of the update infrastructure (no separate Explore agent needed).

### Relevant Components
- **`electron-builder.yml`**: `publish: { provider: github, owner: sefacakirrr, repo: Slate }`. CI (`.github/workflows`) builds with `--publish always`, so each release carries update metadata (`latest.yml` for Windows, `latest-mac.yml` for mac). Mac target is `dmg` only; `mac.identity: null` (unsigned).
- **`src/main/index.ts`**: imports `autoUpdater` from `electron-updater`; on launch (packaged only) runs `autoUpdater.checkForUpdatesAndNotify()`. This is the only update code today.
- **IPC pattern** (`shared/ipc.ts` + `handlers.ts` + `preload/index.ts`): commands via `IpcCommands`/`register`; push events via `webContents.send` + `window.api.window.on*` (e.g. `onFilesChanged`, `onNoteChanged` added in E11) — the model for update events.
- **`SettingsPanel.tsx`**: sectioned UI (Theme, Vault, Vault Password, Shortcuts, Maintenance). A new "Updates" section slots in. Version is already shown in the sidebar (from package.json).
- **`shell`** (Electron) is already used (`attachment:open`) → `shell.openExternal` for the mac Releases link.

### Current Implementation
Silent launch check only. No manual trigger, no update UI, no per-state feedback.

### Gaps Identified
- No `update:*` IPC, no renderer update state, no Settings button.
- macOS can't self-install (unsigned + no `zip` target) — needs a detect-and-redirect path instead of `autoUpdater` install.
- Nothing communicates "packaged-only" to the user in dev.

### Patterns to Follow
- Event push like `onNoteChanged` (main → renderer via `webContents.send`, preload `on*` + unsubscribe).
- `register`-wrapped IPC commands returning `IpcResult<T>`.
- Settings section styling from `SettingsPanel`.

---

## 3. Architecture

### Platform split (the core design)
```
Windows: update:check → autoUpdater.checkForUpdates()
           → events: available / not-available / download-progress / downloaded / error
           → update:install → autoUpdater.quitAndInstall()
macOS:   update:check → fetch https://api.github.com/repos/sefacakirrr/Slate/releases/latest
           → compare tag_name vs app.getVersion() (semver)
           → { available, latestVersion, url }; update:openReleases → shell.openExternal(url)
```
macOS deliberately avoids `autoUpdater` (unsigned mac throws / can't install). A plain HTTPS version check is signing-independent and reliable.

### Update state (renderer)
A small `updateStore` (or local Settings state): `idle | checking | up-to-date | available | downloading(%) | downloaded | error`, plus `latestVersion`. Windows drives it via events; macOS resolves `checking → up-to-date | available` from the API result.

### Not-packaged guard
`app.isPackaged` gates real behavior; in dev the Settings action is disabled with a "updates work in the installed app" note.

---

## 4. Success Criteria

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | Settings shows the current app version and a "Check for updates" action | Open Settings in a packaged build |
| 2 | Windows: when a newer release exists, the app downloads it and offers "Restart to update" that installs it | Packaged Win build one version behind → check → restarts into the new version |
| 3 | Windows/macOS: when already current, the UI says "up to date" | Check on the latest version |
| 4 | macOS: when a newer release exists, the UI says so and opens the GitHub Releases page | Packaged mac build one version behind → check → Releases opens |
| 5 | Errors (offline, API failure) surface a clear message, no crash | Check while offline |
| 6 | In dev (`npm run dev`), the action is disabled/explained rather than silently failing | Run dev → action shows the packaged-only note |

---

## 5. Scope

### In Scope
- Main update service + `update:check` / `update:install` / `update:openReleases` IPC + progress/state events.
- Windows: full `electron-updater` check → download → `quitAndInstall`.
- macOS: GitHub Releases API version compare → open Releases page.
- Settings "Updates" section: version, check button, states (checking / up-to-date / available / downloading% [win] / downloaded→restart [win] / open-releases [mac] / error), dev-disabled state.
- Keep the existing silent launch check (or fold it in) — decide in planning.

### Out of Scope
- **Full macOS in-app install** — needs code signing (Apple Developer cert, paid) + a `zip` mac target + notarization. Tracked separately; documented as the reason for the mac redirect path.
- **Release-notes rendering / changelog UI** — maybe later; the Releases page has notes.
- **Delta/differential updates, rollback, staged rollout** — not needed for a personal app.
- **Auto-download in the background** beyond the existing launch check — the manual button is the focus.

---

## 6. Risks & Open Questions

| Risk | Impact | Mitigation |
|------|--------|------------|
| Only testable in packaged builds (not `npm run dev`) | Hard to iterate; easy to ship a subtle bug | Guard with `app.isPackaged`; test with real installed builds one version behind; keep the logic small and split cleanly by platform |
| `electron-updater` on unsigned macOS throws / can't install | A naive cross-platform `autoUpdater` path would fail on mac | macOS never calls `autoUpdater` — it uses a plain GitHub API version check + `shell.openExternal` |
| GitHub API rate limit (60/hr unauthenticated) | Repeated manual checks could 429 | Manual, user-initiated checks stay well under; handle 429 as a normal error; could fall back to the `latest-mac.yml` asset URL |
| Windows unsigned install → SmartScreen warning | User sees a scary prompt | Accept for now (documented); real signing is a separate cost decision |
| Version compare correctness (tag `v0.1.9` vs `0.1.9`) | False "up to date" / false "available" | Normalize the leading `v`; compare with a small semver check |

---

## 7. Design Inputs

- **Design handover**: none. UI is a Settings section following the existing `SettingsPanel` pattern (button + status text + optional progress bar).
- **Design status**: informal, low risk.
- **Visual verification**: version shown; button reflects each state; Windows progress + restart affordance; mac "open Releases" affordance; dev-disabled note.
