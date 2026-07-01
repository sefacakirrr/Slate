# Phase 01: Settings Updates UI

> **Status**: COMPLETE (reviewed 2026-07-01; visual confirmation in P02 UAT)
> **Dependencies**: Phase 00
> **Design status**: informal — a new `SettingsPanel` section following the existing section pattern.

---

## Goal

An "Updates" section in Settings showing the current version and a check action that reflects every update state — Windows download/restart, macOS open-Releases, and a disabled note in dev.

---

## Tasks

| # | Task | Status | Acceptance Criteria |
|---|------|--------|-------------------|
| 1.1 | "Updates" section in `SettingsPanel`: show current version (`app.getVersion()` via IPC or existing version source) + a "Check for updates" button | done | Section renders with the running version and a button |
| 1.2 | Subscribe to `onUpdateState`; drive UI from status: `idle → checking → (up-to-date / available / downloading% / downloaded / error / dev-disabled)` | done | Clicking check moves through states as events arrive |
| 1.3 | Windows affordances: `downloading` shows a percent/progress; `downloaded` shows a "Restart to update" button → `update:install` | done | On a win build with an update: progress then a working restart-install |
| 1.4 | macOS affordance: `available` shows "New version vX.Y.Z — Open Releases" → `update:openReleases`; both platforms show "You're up to date" on `up-to-date` | done | On a mac build with an update: button opens the Releases page; current → up-to-date text |
| 1.5 | Dev / error states: `dev-disabled` disables the button with "updates work in the installed app"; `error` shows a clear message + allows retry | done | In `npm run dev` the button is disabled with the note; a failed check shows an error and can be retried |

**Status values**: pending → in_progress → done

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/renderer/components/SettingsPanel.tsx` | Modify | "Updates" section + state-driven rendering |
| `src/renderer/stores/updateStore.ts` | Create (optional) | hold update state from `onUpdateState` if local component state gets unwieldy |

---

## Verification

- `npm run typecheck` + `npm run build` clean; `npm run test` still green.
- Manual (`npm run dev`): the Updates section shows the version and a disabled button with the packaged-only note (real flow is P02 UAT).
- Visual: each state renders distinctly; the restart (win) and open-Releases (mac) actions are wired.

---

## Notes

- Reuse `SettingsPanel` section styling (uppercase heading, grouped controls) — mirror the "Maintenance"/"Vault Password" sections.
- Keep update state local to the panel via `onUpdateState` unless it needs to live longer; a tiny `updateStore` is the fallback.
- Platform check: `api.platform` (already exposed) picks win vs mac affordances; but prefer driving off the `status` payload from main (which already encodes platform-appropriate states) so the UI stays declarative.
- Current version: reuse whatever the sidebar uses to show the version (package.json via IPC/build-time), don't add a second source.

---

## Review Log

### 2026-07-01 — Phase Review: APPROVED

**Tasks**: 5/5 genuinely complete — Updates section in `SettingsPanel`: version via `__APP_VERSION__`, `api.update.onState` subscription, and a state-driven render covering every status (checking/up-to-date/available/downloading%/downloaded→install/dev-disabled/error).
**Quality**: PASS — full suite 227/227; typecheck (node+web) clean; `npm run build` clean; `SettingsPanel` biome-clean.
**Integration**: `api.update.check/install/openReleases/onState` all consumed (4 call sites); the P00 event stream drives the UI end to end.
**Plan integrity**: OK — only P02 (UAT) remains; it covers all success criteria. No gaps, no invalidated assumptions.
**Commit**: none (user directive: skip commits this session)

**Adversarial audit — verified the state machine (no defect)**:
- **Re-check works**: after `up-to-date`/`error`, the button is enabled again (`disabled` = `busy || dev-disabled` only).
- **Platform branch is on the payload**: mac `available` (has `url`) → "Open Releases"; win `available` (no `url`) → auto-advances to `downloading → downloaded` → "Restart to update" (`install`).
- **`onState` cleanup**: the effect returns the unsubscribe; strict-mode double-mount safe.

**Note (non-blocking)**:
- In `npm run dev` the user must click Check once to see `dev-disabled` (the renderer can't know `app.isPackaged` up front). Fine — dev-only, and packaged builds never hit it.
