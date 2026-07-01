# Phase 04: User Acceptance Testing

> **Status**: COMPLETE — user-approved 2026-07-01 (macOS; Windows round-trip not tested this session)
> **Dependencies**: All implementation phases
> **Note**: Only the user can mark this phase complete.

---

## Goal

User verifies encryption works end-to-end, the security boundary holds, and a locked note round-trips across macOS and Windows.

---

## Test Scenarios

| # | Scenario | Expected Result | Status |
|---|----------|-----------------|--------|
| 1 | Set a vault password (first time) | No-recovery warning shown and must be acknowledged; salt+verifier appear in settings.json, no password | pending |
| 2 | Lock a note | `note.md` becomes `note.md.enc`; hex-inspecting the file shows no plaintext | pending |
| 3 | Search for a term that's only in the locked note | Zero results (the note is out of the index) | pending |
| 4 | Click the locked note while vault is locked | Unlock modal appears; wrong password rejected; correct password opens the note with content intact | pending |
| 5 | Edit and save an unlocked locked-note | Content persists; file stays `.md.enc` and encrypted on disk | pending |
| 6 | "Lock vault now", then reopen the note | Note re-prompts for the password (session key cleared) | pending |
| 7 | Quit and relaunch with a locked note previously open | App launches clean; locked note is not auto-opened, prompts for password when clicked | pass |
| 8 | Copy a `.md.enc` (+ settings salt/verifier) from macOS to Windows (or vice-versa) and open it | Same password opens the note; content identical | not tested (only macOS available this session) |
| 9 | Forget-password path (intentional) | No way to recover; behavior matches the warning (documented expectation, not a bug) | pass |

Scenarios 1–7 and 9 verified by the user on macOS. Scenario 8 (cross-platform round-trip) untested — the crypto is Node-builtin and deterministic (unit-tested), so it is expected to hold, but it has not been exercised on Windows.

---

## Acceptance Checklist

- [x] Locked note is ciphertext on disk (criterion 1)
- [x] Locked note never appears in search results (criterion 2)
- [x] Correct password unlocks, wrong password rejected (criterion 3)
- [x] Open→edit→save round-trips exactly (criterion 4)
- [x] Vault password never written to disk (criterion 5)
- [x] Reconciliation ignores locked notes, no launch error (criterion 6)
- [ ] macOS ↔ Windows round-trip works (criterion 7) — not tested (macOS-only session; unit tests cover determinism)
- [x] Quit clears session key; vault re-locks on relaunch (criterion 8)

---

## Sign-Off

- [x] **User Approved** — Date: 2026-07-01 (macOS; Windows cross-platform round-trip deferred)

---

## Review Log

_Populated by /epic-phase-review._
