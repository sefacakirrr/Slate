# Epic 10: Note Encryption / Locking

> **Status**: Planning
> **Created**: 2026-07-01
> **Baseline**: `80fabe8` (revert point if epic is abandoned)
> **Skill**: /epic-create
> **Vision revision**: PROJECT-VISION.md 2026-07-01 (optional per-note at-rest encryption added to scope)

---

## 1. Summary

**Problem**: Every note in the vault is plain markdown on disk and fully indexed for search. A user who keeps sensitive notes (credentials, personal, private context) alongside ordinary ones has no way to protect the sensitive few — anyone with filesystem access, or the search index, can read them.

**Vision**: The user can **lock selected notes** behind a **single vault password**. A locked note is encrypted at rest (scrypt-derived key, AES-256-GCM), stored as a `.md.enc` container, excluded from the plaintext search index, and readable only after the vault is unlocked in-session. The password lives only in main-process memory — never written to disk, never sent to the renderer, no recovery. Ordinary notes are untouched and stay portable plain markdown.

**Key Deliverables**:
1. `EncryptionService` (main-process class) — scrypt KDF + AES-256-GCM, versioned on-disk container format, in-memory session key.
2. Lock / unlock flow — set vault password (first lock), unlock (password verified against a stored verifier), manual "lock now".
3. Index safety — locked notes removed from FTS on lock, never indexed while locked, skipped by reconciliation.
4. VaultService + IPC integration — encrypt-on-write / decrypt-on-read for `.md.enc`, locked notes surfaced in listings via filename (no plaintext title/snippet).
5. UI — sidebar lock indicator, lock/unlock actions, password prompt modal.
6. Cross-platform correctness — verified round-trip on macOS and Windows.

---

## 2. Exploration Findings

> Codebase exploration performed 2026-07-01 via /epic-create (Explore agent).

### Relevant Components
- **VaultService** (`src/main/services/VaultService.ts`): `NOTE_EXTENSIONS = ['.md','.markdown','.txt']` (line 6). `collectNoteFiles()` (133-156) is the single source of truth for "what's a note"; excludes `_`/`.` segments. `listNotesDetailed()` (69-97) derives title from the first non-empty line and snippet from the first 3 lines — **reads plaintext content**. `readNote()` (122-125) and atomic `writeNote()` (163-176, temp+fsync+rename) are the read/write hook points. `resolveSafe()` (275-281) is the path-safety boundary.
- **IPC contract** (`src/shared/ipc.ts`): `IpcCommands` discriminated union (16-78); `IpcResult<T>` (13). Handlers registered once each via generic `register<K>()` in `src/main/ipc/handlers.ts` (227-280); preload mirrors the surface and exposes `window.api` (`src/preload/index.ts` line 89).
- **IndexService** (`src/main/services/IndexService.ts`): `notes` table + external-content FTS5 `notes_fts` (49-89). `indexNote()` (97-105) and `rebuild()` (126-138) are the write boundaries; `removeNote()` (108-110) deletes from FTS; `getIndexed()` (141-143) feeds reconciliation.
- **SearchService** (`SearchService.ts` 32-84): read-only FTS5 MATCH with snippets — automatically excludes anything not in the FTS table.
- **reconcile** (`src/main/services/reconcile.ts` 19-34): compares disk mtimes (`listNotesWithMtime`) against `getIndexed()`; re-indexes newer, removes missing.
- **Renderer**: `workspaceStore.ts` — `openTab()` (64-81) calls `readNote`, `saveTab()` (124-140) calls `writeNote`, `dirty = draft !== baseline`. `vaultStore.ts` — `loadFiles()` (78-86) via `listNotes`/`listDirs`. `NotesList.tsx` renders title/snippet from `listDetailed()`. `Sidebar.tsx` builds the tree, `stripNoteExt` on row labels.
- **UI patterns**: `ConfirmDialog.tsx` (1-102) is the modal template (escape/enter, backdrop cancel) — the unlock prompt follows it. `SettingsPanel.tsx` sections (Theme/Vault/Shortcuts/Maintenance) host a new "Vault Password" section.
- **SettingsService** (`SettingsService.ts`): lazy-loaded, atomically persisted JSON. Holds `vaultPath`, `workspace`, `theme`. Home for the non-secret **vault salt + verifier** and any encryption preference. **Password itself must never be persisted.**
- **Tests**: `VaultService.test.ts` (mkdtemp/rm, `vi.mock` for failure injection); `IndexService.test.ts` / `reconcile.test.ts` run under `ELECTRON_RUN_AS_NODE=1` (better-sqlite3 ABI); assert observable behavior (search results), not internals.

### Current Implementation
No encryption exists. `crypto` is used only for hashing (`AttachmentService`) and `randomBytes` (`VaultService` temp names). All note content is plaintext on disk and mirrored into FTS.

### Gaps Identified
- No representation for a "locked" note — `.enc` files aren't in `NOTE_EXTENSIONS`, so they'd be invisible in listings today.
- `listNotesDetailed()` assumes readable content — breaks on ciphertext.
- Reconciliation would see a locked file on disk with no index entry and try to (re)index it every launch.
- No password lifecycle (set / verify / hold-in-memory / clear).
- **Chokidar watcher is documented in ARCHITECTURE but not implemented** — external changes aren't auto-detected today; not a blocker for this epic.

### Patterns to Follow
- Service-as-class owning stateful resource (like `IndexService`, `SettingsService`).
- IPC: add commands to `IpcCommands`, wire once in `handlers.ts`, mirror in preload + renderer api.
- Errors thrown at service layer, converted to `IpcResult` at the IPC boundary.
- Tests under Electron Node runtime; assert observable behavior.

---

## 3. Architecture

### Locked-note identity — distinct extension `.md.enc`
`isLocked(path) === path.endsWith('.enc')` — a pure string check, **zero I/O**. Every integration point (listing, index, reconcile) branches cheaply. The filename stays cleartext, so title/snippet come from the filename; only the note **body** is encrypted. Rejected alternative: same `.md` extension with an encrypted body + magic-header — forces a file read at every "is this locked?" decision.

### Password model — one vault key + verifier
- Key = `scryptSync(password, vaultSalt)` → 32 bytes. `vaultSalt` is generated once and stored (non-secret) in settings.
- A **verifier blob** (a known constant sealed with the key) is stored in settings. On unlock, derive the key and open the verifier: success ⇒ correct password; it also guarantees every locked note shares one password.
- Password/key held only in `EncryptionService` memory for the session; cleared on quit or manual lock. Never persisted, never crosses IPC.

### On-disk container format (versioned)
`magic ("SLATENC") | version (1 byte) | nonce (12 B) | ciphertext | GCM tag (16 B)`. Binary — no line-ending/encoding drift across OSes. `vaultSalt` is vault-wide (in settings), not per-file. Version byte lets the format evolve without breaking old notes.

### Integration points
```
lock(path):    read plaintext → seal(body) → write path+'.enc' → delete path → index.removeNote(path)
unlock(pw):    derive key → verify → hold key in memory
read(.md.enc): require unlocked → open() → plaintext to renderer (never indexed)
write(.md.enc):require unlocked → seal() → atomic write
index/reconcile: skip when isLocked(path); never read a .enc for indexing
```

### Current → Target (main process)
```
Current:  VaultService ─→ IndexService ←─ SearchService
Target:   VaultService ─┬→ IndexService ←─ SearchService
                        └→ EncryptionService (session key, seal/open, isLocked)
                           ▲ IPC: vault:setPassword / unlock / lock / lockNote / isLocked / isVaultUnlocked
```

---

## 4. Success Criteria

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | Locking a note replaces `note.md` with `note.md.enc` whose bytes are ciphertext (no plaintext recoverable with a hex viewer) | Lock a note; inspect the file on disk |
| 2 | A locked note's terms never appear in search results | Unit test: lock a note, query its unique term → no hit |
| 3 | Correct password unlocks; wrong password is rejected (GCM auth fails) | Unit test + manual: wrong password → error, right password → content |
| 4 | Unlocking, opening, editing, saving a locked note round-trips content exactly | Unit test: encrypt→decrypt identity; manual edit+save+reopen |
| 5 | The vault password is never written to disk (only salt + verifier are) | Inspect `settings.json`; grep for password material |
| 6 | Reconciliation does not try to index locked notes and does not error on them at launch | Unit test: reconcile with a `.md.enc` present → no index entry, no throw |
| 7 | A note locked on macOS opens on Windows and vice-versa | Manual cross-platform round-trip (copy the `.md.enc` + settings salt/verifier) |
| 8 | Quitting the app clears the session key; on relaunch the vault is locked until the password is re-entered | Manual: lock, quit, relaunch → locked note prompts for password |

---

## 5. Scope

### In Scope
- `EncryptionService`: scrypt KDF, AES-256-GCM seal/open, versioned container, in-memory session key, `isLocked()`.
- Vault password bootstrap (set on first lock), unlock with verifier-based validation, manual "lock now".
- `vault:lockNote`, `vault:unlock`, `vault:setPassword`, `vault:isLocked`, `vault:isVaultUnlocked` IPC commands (final names TBD in planning).
- VaultService: recognize `.md.enc` in listings (title/snippet from filename), route read/write of locked notes through encryption.
- IndexService/reconcile: exclude locked notes; `removeNote` on lock; skip `.md.enc` on reconcile.
- UI: sidebar lock indicator, lock/unlock action on a note, unlock password modal (ConfirmDialog-style), "Vault Password" + "Lock now" in SettingsPanel.
- Tests: crypto correctness (round-trip, tamper, wrong password), integration (search exclusion, reconcile), cross-platform UAT.

### Out of Scope
- **Change vault password** — requires decrypt-all + re-encrypt-all; its own future phase/epic. Excluded to keep the epic tight.
- **Password recovery / reset** — deliberate zero-knowledge stance (locked in the vision revision). Forgotten password = permanent loss.
- **Idle auto-lock (after N minutes)** — nice-to-have; the memory-only key already locks on every quit. A manual "lock now" covers the immediate need.
- **Encrypting attachments / whole-vault encryption** — this epic is per-note body encryption only.
- **Locking notes from quick-capture** — captures are always plaintext; the user can lock afterward.
- **Chokidar external-change handling for `.md.enc`** — the watcher isn't implemented at all yet; out of this epic's scope.

---

## 6. Risks & Open Questions

| Risk | Impact | Mitigation |
|------|--------|------------|
| A locked note left in (or re-added to) the FTS index leaks plaintext via search snippets | Confidentiality breach — the whole point defeated | Treat index exclusion as a hard requirement with a dedicated test; `removeNote` on lock; `isLocked` guard in index + reconcile paths, checked **before** any read |
| Forgotten vault password | Permanent, unrecoverable data loss | Unmistakable no-recovery warning at first lock / password set; require explicit confirmation; documented in vision |
| Crypto/format bug (nonce reuse, truncated tag, version drift) | Corrupted or unopenable notes | Keep the path tiny and standard (scrypt + AES-256-GCM, no custom scheme); version the header from day one; round-trip + tamper + wrong-password tests before UI |
| Windows atomic write (temp→rename) behaves differently when target is open/locked | Failed or non-atomic save of a `.md.enc` | Verify the atomic-write path on Windows for `.md.enc`; reuse VaultService's existing temp+rename (already cross-platform for `.md`) |
| Tab open when a note becomes locked, or restoring a locked tab after quit with no session key | Save-as-plaintext corruption, or a failed tab restore | `read`/`write` require an unlocked vault and branch on `.md.enc`; `readNote` throws a specific `note-locked` error; renderer skips restoring locked tabs gracefully |
| Stray `.tmp-*` from an interrupted encrypted write | Clutter, possible confusion | Existing behavior (hidden, cleaned on next write); optional cleanup sweep in reconcile |

### Open Questions (resolve in /epic-plan)
- Final IPC command names and exact request/response shapes.
- Where the lock/unlock action lives in the UI (context menu on the note row vs. an explicit button) — follow existing Sidebar affordances.
- Whether the unlock prompt is a standalone modal triggered on opening a locked note, a SettingsPanel action, or both.

---

## 7. Design Inputs

- **Project design handover**: none (`.claude/DESIGN-HANDOVER.md` absent).
- **Design status**: informal — no formal handover. UI scope is modest and follows existing patterns (`ConfirmDialog`, `SettingsPanel` sections, `Sidebar` rows).
- **Design review**: not run; low risk given pattern reuse. Flag if the lock/unlock UX grows beyond a modal + an icon + a settings section.
- **Visual verification**: sidebar shows a clear locked indicator; unlock modal masks input; locked note opens into a normal editor tab after unlock.
- **Deferred UI decisions**: none blocking; exact action placement resolved in /epic-plan.
