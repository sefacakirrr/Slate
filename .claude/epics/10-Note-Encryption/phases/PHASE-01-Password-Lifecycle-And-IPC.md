# Phase 01: Password Lifecycle & IPC

> **Status**: COMPLETE (reviewed 2026-07-01)
> **Dependencies**: Phase 00

---

## Goal

The vault can be given a password, unlocked, and locked through IPC. The vault `salt` + `verifier` persist in settings (never the password); the session key lives in `EncryptionService` memory. No note is encrypted yet — this phase is the password machinery only.

---

## Tasks

| # | Task | Status | Acceptance Criteria |
|---|------|--------|-------------------|
| 1.1 | Extend `SettingsData` with `encryption?: { salt: string; verifier: string }` (base64), plus get/set; keep atomic persist | done | Setting/reading round-trips; absent field ⇒ "no vault password set"; password itself is never a field |
| 1.2 | Instantiate `EncryptionService` in `main/index.ts`; inject into IPC handler deps (and later into reconcile) | done | App launches; service is a single shared instance |
| 1.3 | Add IPC commands to `shared/ipc.ts`: `vault:setPassword` (`{password}→void`), `vault:unlock` (`{password}→boolean`), `vault:lockVault` (`void→void`), `vault:isVaultUnlocked` (`void→boolean`), `vault:hasPassword` (`void→boolean`) | done | Types compile; each mirrored in the `Api` type |
| 1.4 | Handlers in `handlers.ts`: **setPassword** (generate salt, derive key, store salt+verifier, hold key) — refuse if a password already exists; **unlock** (derive, `checkVerifier`; hold key only on success, return false on wrong password); **lockVault** (clear session key); **isVaultUnlocked** / **hasPassword** | done | Wrong password ⇒ `unlock` returns false and no key is held; right password ⇒ true and unlocked |
| 1.5 | Mirror the new commands in `preload/index.ts` and `renderer/api/index.ts` | done | `window.api.vault.unlock(...)` etc. typed and callable from renderer |
| 1.6 | Tests: first-time setPassword persists salt+verifier and NOT the password; unlock accepts correct / rejects wrong; lockVault clears session; `settings.json` contains no password bytes | done | `npm run test` green; a grep of the written settings file finds no plaintext password |

**Status values**: pending → in_progress → done

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/main/services/SettingsService.ts` | Modify | Add `encryption { salt, verifier }` field + accessors |
| `src/main/index.ts` | Modify | Construct `EncryptionService`, inject into handler deps |
| `src/shared/ipc.ts` | Modify | New `vault:*` password commands + `Api` mirror |
| `src/main/ipc/handlers.ts` | Modify | setPassword / unlock / lockVault / isVaultUnlocked / hasPassword |
| `src/preload/index.ts` | Modify | Expose new commands on `window.api` |
| `src/renderer/api/index.ts` | Modify | Typed renderer wrapper for new commands |
| `src/main/services/SettingsService.test.ts` | Create/Modify | Password-lifecycle + no-password-persisted tests |

---

## Verification

- `npm run test` green (lifecycle tests).
- `npm run typecheck` / `npm run check` clean.
- Manual/inspection: after `setPassword`, open `userData/settings.json` — see `encryption.salt` + `encryption.verifier`, **no password**.

---

## Notes

- `setPassword` is first-time-only in v1 (no change-password — that's out of scope). If `encryption` already exists, reject with a clear error.
- `unlock` returning a boolean (not throwing) keeps the renderer flow simple for a wrong-password retry loop.
- Salt is generated once at first `setPassword` and never regenerated (regenerating would orphan every existing `.md.enc`).
- Session key is process-memory only; app quit clears it implicitly — that IS the "auto-lock on quit" behavior, no toggle needed.

---

## Review Log

### 2026-07-01 — Phase Review: APPROVED

**Tasks**: 6/6 genuinely complete — verified against real code, not the status column:
- SettingsService `encryption` field + `getEncryption`/`setEncryption` (SettingsService.ts) with round-trip + across-instance tests.
- 5 IPC commands defined (`shared/ipc.ts`), handled (`handlers.ts`), registered (all in `registerIpcHandlers`), and exposed via preload — traced each end to end.
- `EncryptionService` constructed once in `main/index.ts` and injected into handler deps.
**Quality**: PASS — full suite 205/205 (Settings 12 + Encryption 17 + rest); `typecheck` (node+web) clean; new code biome-clean. Pre-existing baseline noise untouched (`main/index.ts` autoUpdater format diff, `handlers.ts` useTemplate infos in deleteFolder/renameFolder — all predate this phase).
**Integration**: Main-side machinery is wired (handlers→service→settings). New IPC commands are NOT yet called from the renderer — that is P03 (UI) by design. Noted as expected, not a gap.
**Plan integrity**: OK — P02 covers locking/index-exclusion/reconcile; P03 consumes these IPC commands in the UI; P04 UAT. No coverage gaps or invalidated assumptions.
**Commit**: none (user directive: skip commits this session)

**Finding (adversarial audit — fixed inline, not deferred)**:
- **Data-loss window in `vault:setPassword`**: `initPassword` held the session key in memory *before* the salt was persisted. If `setEncryption` threw (disk error), the vault would be unlocked with a key whose salt was never saved — locking a note in that state would make it permanently unopenable after restart. Fixed: wrapped the persist in try/catch; on failure `lockVault()` rolls back the in-memory key and rethrows, so state is always consistent (persisted+unlocked or not-persisted+locked, never in between).

**Note (not blocking)**:
- Handlers have no direct unit-test harness in this codebase (`buildHandlers` isn't exported; tests are service-level). The setPassword rollback is verified by inspection + typecheck. If handler-level coverage becomes valuable later, exporting `buildHandlers` for a fake-deps test is the cheap path — candidate for backlog, not this epic.
