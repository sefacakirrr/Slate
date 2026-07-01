# Epic 12: In-App Update — Summary

> **Duration**: 2026-07-01 · **Phases**: 2 impl (00–01) + UAT (post-release)
> **Status**: COMPLETE (implementation) · **Baseline**: `26fb852` · **Final**: v0.1.10 release commit

## Results
A "Check for updates" action in Settings, driven by a main-process `UpdateService` with a hard platform split:
- **Windows**: `electron-updater` check → auto-download → `quitAndInstall` (restart-to-update).
- **macOS**: GitHub Releases API version check (`semverGt`) → open the Releases page (signing-independent; unsigned mac can't self-install).
- Single `update:state` event stream; `app.isPackaged` guard → `dev-disabled`. Settings "Updates" section renders every state (checking / up-to-date / available / downloading% / downloaded→restart / open-releases / dev-disabled / error). 227 tests green; build clean.

## Learnings
- The signing constraint drove the whole design: macOS never touches `autoUpdater` (a plain GitHub API compare sidesteps the "unsigned can't install" wall).
- Update flows are packaged-only — the real E2E is inherently post-release, so UAT is deferred to a real release.

## Deferred Items
| Item | Reason | Follow-up |
|------|--------|-----------|
| Full macOS in-app install | Needs code signing (Apple cert) + a `zip` mac target | `.claude/backlog/tasks.md` |
| UAT scenarios 2–3 (detect/install a newer release) | Requires a published release newer than the installed build | Verify after v0.1.10 by publishing the next release |
| Windows install E2E | Only testable on a packaged Windows build | Backlog / next Windows build |
