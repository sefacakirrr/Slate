# Epic 12: In-App Update — Planning

> **Status**: COMPLETE
> **Closed**: 2026-07-01

> Phase structure, dependencies, and progress tracking.
> Source: VISION.md (2026-07-01). Decisions: Windows uses `electron-updater` (download+install); macOS uses a GitHub Releases API version check + open Releases (never `autoUpdater`, because unsigned mac can't self-install); packaged-only; full mac in-app install out of scope (needs signing + zip target).

---

## Phase Overview

| Phase | Name | Goal | Dependencies | Status | Progress | Reviewed | Commit |
|-------|------|------|-------------|--------|----------|----------|--------|
| 00 | Update Service + IPC (main) | `UpdateService` platform-split check/install/open-releases + `update:*` IPC + state events, packaged-guarded | None | COMPLETE | 6/6 | ✓ | (uncommitted) |
| 01 | Settings Updates UI | "Updates" section: version, check button, all states (win + mac + dev-disabled) | Phase 00 | COMPLETE | 5/5 | ✓ | (uncommitted) |
| 02 | User Acceptance Testing | User verifies in packaged builds (Win install; mac detect→Releases) | All phases | PENDING (post-release) | 0/6 | | |

**Status values**: NOT STARTED → IN PROGRESS → COMPLETE
**Reviewed**: Set only by /epic-phase-review (mandatory before COMPLETE)
**Commit**: Implementation commit hash (7 chars)

---

## Critical Path

```
Phase 00 (main update service + IPC + state events)
   → Phase 01 (Settings Updates UI)
      → Phase 02 (UAT — packaged builds)
```

Linear. P00 is the platform-split engine (testable at least for the semver compare). P01 is the UI reacting to `update:state`. P02 is manual verification in real installed builds (the only place it truly runs).

---

## Cross-Cutting Decisions

- **One event channel**: `update:check` just triggers; all outcomes (checking/up-to-date/available/downloading/downloaded/error) arrive via `update:state` events, so the UI has a single subscription. Both platforms funnel through it.
- **macOS never calls `autoUpdater`** — it fetches `GET /repos/sefacakirrr/Slate/releases/latest`, semver-compares `tag_name` (strip leading `v`) vs `app.getVersion()`, and emits `available{url}` / `up-to-date` / `error`.
- **`app.isPackaged` guard**: in dev, `update:check` returns a `dev-disabled` state; the UI disables the button with a note.
- **No signing work here** — full mac in-app install stays out; documented.
- Semver compare is the one unit-testable piece — cover it.
