# Epic 10: Note-Encryption — Summary

> **Duration**: 2026-07-01 (single session)
> **Phases**: 5 completed (00–03 implementation + 04 UAT)
> **Status**: COMPLETE
> **Baseline**: `80fabe8` (from VISION.md — revert point)
> **Final**: shipped in the `v0.1.8` release commit

---

## Results

Optional per-note at-rest encryption, delivered end to end:

- **Crypto core** (`EncryptionService`): scrypt KDF (NFC-normalized password) + AES-256-GCM, versioned `SLATENC` binary container (`magic | version | nonce | ciphertext | tag`). Single vault key held only in main-process memory; a verifier blob validates the password on unlock. Zero new dependencies — Node built-in `crypto` only.
- **Password lifecycle + IPC**: `vault:setPassword` (first-time, no-recovery), `unlock` (verifier-checked), `lockVault`, `hasPassword`, `isVaultUnlocked`. Only salt + verifier persist in settings.json; the password is never written to disk.
- **Note locking + the security boundary**: `lockNote`/`unlockNote`/`isLocked`; locked notes live as `.md.enc`; encrypt-on-write / decrypt-on-read at the IPC layer. Locked notes are **excluded from the FTS index at the index layer itself** (`indexNote` + `rebuild` + `reconcile` all refuse `.enc`), test-proven so search can never leak locked content.
- **UI**: sidebar lock indicator + lock/unlock/rename actions, unlock & set-password modal with a blunt no-recovery warning, SettingsPanel "Vault Password" section (set / lock now / unlock), tab re-pointing on lock/unlock, dirty-tab flush before lock/unlock.

Mapped to success criteria: 7 of 8 verified via unit tests + macOS UAT. Criterion 7 (macOS↔Windows round-trip) is unit-tested for determinism but not exercised on Windows this session.

Final state: `npm run build` ✓, 213 tests ✓, typecheck ✓.

---

## Learnings

### What Worked
- **Standalone crypto core first (P00)**: building/testing `EncryptionService` in isolation before any wiring meant the risky part was proven before integration.
- **Enforcing the security boundary at the index layer**, not just at callers: the P02 review caught that `index:rebuild` bypassed the exclusion; moving the `.enc` refusal into `IndexService.indexNote`/`rebuild` made it impossible for any caller to leak a locked note.
- **Adversarial phase reviews earned their keep** — each gate found a real defect: NFC password normalization (cross-platform lockout), setPassword persist-order data-loss window, the rebuild index leak, and the lock/unlock dirty-tab data loss.

### What Didn't Work
- **Distinct-extension choice rippled wider than planned**: `.md.enc` had to be threaded through listing, rename guard, reconcile, and index — a few were missed on first pass and caught in review. Worth enumerating every path that touches "what is a note" up front.

### For Future Epics
- Consider a small handler-level test harness (export `buildHandlers`) — the IPC handlers remain the least-tested layer; correctness there was verified by inspection + the service tests beneath.

---

## Deferred Items

| Item | Reason | Follow-up |
|------|--------|-----------|
| Windows cross-platform round-trip verification (criterion 7) | Only macOS available this session; crypto is deterministic + unit-tested | Verify on a Windows build before relying on cross-machine `.md.enc` |
| Change vault password (decrypt-all + re-encrypt-all) | Explicitly out of v1 scope | Future epic if needed |
| Friendlier error for a `.md.enc` opened without its settings salt/verifier | Off the no-sync happy path; currently shows `no-password` | Backlog, low priority |
| Idle auto-lock (after N minutes) | Out of v1 scope; quit already clears the key | Backlog if dogfooding shows a need |

---

## Notes

- Pre-existing lint baseline (Sidebar `useTemplate`/`noNonNullAssertion`/a11y, handlers `useTemplate`) predates this epic and was left untouched. E10 code is lint-clean.
- Vision revision (2026-07-01) recorded the opt-in exception to the "all notes are portable plain markdown" criterion in PROJECT-VISION / TECHSTACK / ARCHITECTURE / ROADMAP / CLAUDE.md.
