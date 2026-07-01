# Phase 02: User Acceptance Testing

> **Status**: NOT STARTED
> **Dependencies**: All implementation phases
> **Note**: Only the user can mark this phase complete. Requires packaged, published builds.

---

## Goal

User verifies the update flow in real installed builds: Windows downloads+installs; macOS detects and opens Releases; states behave.

---

## Test Scenarios

| # | Scenario | Expected Result | Status |
|---|----------|-----------------|--------|
| 1 | Open Settings → Updates (packaged build) | Current version shown; "Check for updates" enabled | pending |
| 2 | **Windows**, running a build one version behind, click Check | Detects the newer release, downloads (progress), shows "Restart to update"; restarting installs it | pending |
| 3 | **macOS**, running a build one version behind, click Check | Says a new version is available and opens the GitHub Releases page | pending |
| 4 | Either platform, already on the latest version, click Check | "You're up to date" | pending |
| 5 | Offline / network failure, click Check | Clear error message, retry possible, no crash | pending |
| 6 | `npm run dev` (not packaged) | Button disabled with the "installed app only" note | pending |

---

## Acceptance Checklist

- [ ] Current version + check action visible in Settings (criterion 1)
- [ ] Windows: download + restart-install works (criterion 2)
- [ ] Up-to-date state correct on both platforms (criterion 3)
- [ ] macOS: detect + open Releases works (criterion 4)
- [ ] Errors handled gracefully (criterion 5)
- [ ] Dev build disables the action with an explanation (criterion 6)

---

## Sign-Off

- [ ] **User Approved** — Date: ___

---

## Notes

- Requires a published GitHub Release newer than the installed build to exercise scenarios 2–3 (e.g. install v0.1.x, then publish v0.1.(x+1), then Check).
- Windows unsigned install may trigger a SmartScreen warning — expected, documented.
- Full macOS in-app install is out of scope (needs signing) — scenario 3 is detect-and-redirect by design.

---

## Review Log

_Populated by /epic-phase-review._
