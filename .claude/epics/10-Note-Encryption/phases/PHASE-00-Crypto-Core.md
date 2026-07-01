# Phase 00: Crypto Core

> **Status**: COMPLETE (reviewed 2026-07-01)
> **Dependencies**: None

---

## Goal

A standalone, fully-tested `EncryptionService` that derives a key from a password, seals/opens content with AES-256-GCM in a versioned container, holds the session key in memory, and validates a password via a verifier — with no app wiring yet.

---

## Tasks

| # | Task | Status | Acceptance Criteria |
|---|------|--------|-------------------|
| 0.1 | Define the on-disk container format + (de)serialize helpers: `magic "SLATENC"` + `version(1)` + `nonce(12B)` + `ciphertext` + `GCM tag(16B)`, all binary (`Buffer`) | done | Round-trips through serialize→parse; rejects wrong magic and unknown version with a clear error |
| 0.2 | `deriveKey(password, salt) → 32-byte key` via `scryptSync` with fixed, documented params (e.g. N=2^15, r=8, p=1, keylen=32) | done | Same (password, salt) yields identical key; different password or salt yields a different key |
| 0.3 | `seal(plaintext: string, key) → Buffer` and `open(container: Buffer, key) → string` using AES-256-GCM with a fresh random 12-byte nonce per seal | done | `open(seal(x)) === x` for unicode + empty + large inputs; a tampered byte (ciphertext or tag) makes `open` throw |
| 0.4 | Session-key state on the service: hold key in memory, `isUnlocked()`, `lockVault()` clears it, `isLocked(relPath) = relPath.endsWith('.enc')` | done | `isUnlocked()` false before unlock / after `lockVault()`; `isLocked` is a pure string check with no I/O |
| 0.5 | Verifier: `makeVerifier(key) → Buffer` (seals a known constant) and `checkVerifier(blob, key) → boolean` | done | Correct key ⇒ true; wrong key ⇒ false (never throws to caller) |
| 0.6 | `EncryptionService.test.ts` covering 0.1–0.5 incl. determinism, tamper-detection, wrong-password, empty/unicode/large content | done | `npm run test` green under `ELECTRON_RUN_AS_NODE=1` |

**Status values**: pending → in_progress → done

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/main/services/EncryptionService.ts` | Create | The service class: KDF, seal/open, container, session key, verifier, `isLocked` |
| `src/main/services/EncryptionService.test.ts` | Create | Unit tests for the crypto core |
| `src/shared/types.ts` | Modify | Add any shared types (e.g. `EncryptionMeta { salt, verifier }`) if needed by later phases |

---

## Verification

Consult CLAUDE.md for commands. Phase-specific:

- `npm run test` — all EncryptionService tests green (runs under Electron Node).
- `npm run typecheck` and `npm run check` clean.
- No new runtime dependency added — confirm `package.json` unchanged (Node built-in `crypto` only).

---

## Notes

- Use `node:crypto` `scryptSync`, `randomBytes`, `createCipheriv('aes-256-gcm')` / `createDecipheriv`. No `argon2`, no `libsodium` — the whole point is zero native deps (cross-platform, no CI rebuild).
- `scrypt` default `maxmem` may need raising for larger N — set `maxmem` explicitly in options so it doesn't throw.
- Keep the service pure of Electron imports so it unit-tests like `VaultService`.
- The container is versioned from day one so the format can evolve without breaking existing `.md.enc` files.

---

## Review Log

### 2026-07-01 — Phase Review: APPROVED

**Tasks**: 6/6 genuinely complete (verified against `EncryptionService.ts` + 17 passing tests — not just status column)
**Quality**: PASS — full suite 201/201 green (17 for this service); `typecheck:node`/`:web` clean; biome clean on both new files; **zero new runtime dependencies** (`package.json` untouched). Pre-existing project lint errors (Sidebar.tsx a11y, useTemplate across handlers/stores) predate this phase and are out of scope.
**Integration**: N/A for this phase by design — `EncryptionService` is standalone crypto; it is wired into IPC/index in P01–P02. Exported API (`initPassword`/`unlock`/`sealForSession`/`openForSession`/`isLocked`/`isEncryptedPath`) is shaped for those consumers.
**Plan integrity**: OK — remaining phases cover every vision integration path (read decrypt, write encrypt, index exclusion, reconcile guard, listing, UI).
**Commit**: none (user directive: skip commits this session — no hash recorded)

**Findings (adversarial audit — both fixed inline during review, not deferred)**:
- **A (real, cross-platform correctness)**: `deriveKey` did not Unicode-normalize the password. macOS (NFD) vs Windows (NFC) representations of the same characters (e.g. Turkish ç/ğ/ü) would derive different keys → permanent lockout, violating success criterion #7. Fixed: `password.normalize('NFC')` + regression test.
- **B (hardening)**: `lockVault()` dropped the key reference without zeroing the buffer. Fixed: `sessionKey.fill(0)` before nulling, matching the vision's "cleared on lock".

**Carried forward to P01 (non-blocking)**:
- **C**: `scryptSync` is synchronous and blocks the main-process event loop (~hundreds of ms at N=2^15). Acceptable because it runs once per vault unlock (not per note), but P03 UI should show a brief "unlocking…" state and must never invoke the KDF per-note.
