# Epic 10: Note-Encryption — Planning

> **Status**: COMPLETE
> **Closed**: 2026-07-01
> Phase structure, dependencies, and progress tracking.
> Source: VISION.md (2026-07-01). Decisions: `.md.enc` extension, scrypt + AES-256-GCM (Node crypto), single vault password held only in main-process memory, no recovery. changePassword / idle-autolock / quick-capture encryption are out of v1.

---

## Phase Overview

| Phase | Name | Goal | Dependencies | Status | Progress | Reviewed | Commit |
|-------|------|------|-------------|--------|----------|----------|--------|
| 00 | Crypto Core | Standalone, tested `EncryptionService`: KDF, seal/open, container format, session key, verifier | None | COMPLETE | 6/6 | ✓ | (uncommitted) |
| 01 | Password Lifecycle & IPC | Set/unlock/lock vault via IPC; salt+verifier in settings; key in memory | Phase 00 | COMPLETE | 6/6 | ✓ | (uncommitted) |
| 02 | Note Locking & Vault/Index Integration | Lock a note → `.md.enc`, encrypt-on-write / decrypt-on-read, index exclusion, reconcile guard | Phase 01 | COMPLETE | 7/7 | ✓ | (uncommitted) |
| 03 | UI — Lock/Unlock Surface | Sidebar lock indicator, unlock modal, lock/unlock actions, SettingsPanel vault-password section | Phase 02 | COMPLETE | 7/7 | ✓ | (uncommitted) |
| 04 | User Acceptance Testing | User verifies epic end-to-end incl. macOS↔Windows round-trip | All phases | COMPLETE | 8/9 | ✓ | (uncommitted) |

**Status values**: NOT STARTED → IN PROGRESS → COMPLETE
**Reviewed**: Set only by /epic-phase-review (mandatory before COMPLETE)
**Commit**: Implementation commit hash (7 chars)

---

## Critical Path

```
Phase 00 (Crypto Core)
   → Phase 01 (Password Lifecycle & IPC)
      → Phase 02 (Note Locking & Vault/Index Integration)
         → Phase 03 (UI — Lock/Unlock Surface)
            → Phase 04 (UAT)
```

Strictly linear — each phase depends on the one before. P00 is pure crypto with no app wiring (fastest to verify in isolation). The security-critical boundary (index exclusion) lands in P02 and must be test-gated there before any UI.

---

## Cross-Cutting Requirements (every phase)

- **Password never persisted.** Only the vault `salt` + `verifier` blob are stored (settings.json, non-secret). Verify by inspecting settings.json.
- **Renderer never holds key material.** Encrypt/decrypt happen in main; only plaintext or ciphertext crosses IPC.
- **Index exclusion is a security boundary, not an optimization.** A locked note must never sit in the FTS table.
- **Cross-platform.** Binary container + Node crypto ⇒ a `.md.enc` sealed on macOS opens on Windows. Verified in P04.
- Tests run under `ELECTRON_RUN_AS_NODE=1` via `npm run test` (better-sqlite3 ABI).
