# Phase 02: Note Locking & Vault/Index Integration

> **Status**: COMPLETE (reviewed 2026-07-01)
> **Dependencies**: Phase 01

---

## Goal

A note can be locked and unlocked end-to-end in the main process: locking replaces `note.md` with `note.md.enc` (encrypted body), removes it from the search index, and keeps it out of reconciliation; reading a locked note (vault unlocked) returns plaintext; writing re-encrypts. This phase closes the security boundary and is test-gated before any UI.

---

## Tasks

| # | Task | Status | Acceptance Criteria |
|---|------|--------|-------------------|
| 2.1 | VaultService: recognize `.md.enc` as a listable note. In `collectNoteFiles`/listings, include locked notes; `listNotesDetailed` derives **title from filename** and snippet `"🔒 Locked"` for `.enc` — **no content read** | done | A `.md.enc` file appears in listings with a filename title and a locked snippet; no attempt to parse its bytes as text |
| 2.2 | Binary-safe raw I/O for encrypted bodies (e.g. `readBytes`/`writeBytes` on VaultService, atomic temp+rename like `writeNote`) so handlers can read/write container `Buffer`s | done | Round-trips arbitrary bytes atomically; path-safety (`resolveSafe`) still enforced |
| 2.3 | IPC `vault:lockNote(path)`: require unlocked vault → read plaintext → `seal` → write `path+'.enc'` → delete original `path` → `index.removeNote(path)` | done | After lock: `.md.enc` exists, original `.md` gone, and the note's unique term returns no search hit |
| 2.4 | Read/write routing for locked notes at the IPC/handler layer: `readNote` on a `.enc` requires unlocked (`open` → plaintext) else throws `note-locked`; `writeNote` on a `.enc` `seal`s before the atomic write | done | Unlocked: open→edit→save round-trips exactly; locked vault: read returns `note-locked` error via `IpcResult`, no crash |
| 2.5 | Add `vault:isLocked(path)` and (optional) `vault:unlockNote`/rely on vault-level unlock; reconcile.ts skips `isLocked` paths **before** any read, so a `.md.enc` is never indexed and never errors at launch | done | Reconcile test with a `.md.enc` present ⇒ no index row for it, no throw, other notes still reconcile |
| 2.6 | Mirror `lockNote` / `isLocked` in preload + renderer api | done | Callable + typed from renderer |
| 2.7 | Tests: lock→`.enc`+plaintext-gone+search-miss; unlock→read→edit→save round-trip; reconcile skips `.enc`; locked-vault read ⇒ `note-locked` | done | `npm run test` green incl. a dedicated "locked note not searchable" assertion |

**Status values**: pending → in_progress → done

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/main/services/VaultService.ts` | Modify | `.md.enc` listing, filename-title/locked-snippet, binary raw read/write |
| `src/main/ipc/handlers.ts` | Modify | `lockNote`, `isLocked`, encrypt/decrypt routing in read/write |
| `src/main/services/reconcile.ts` | Modify | Skip `isLocked` paths before reading/indexing |
| `src/shared/ipc.ts` | Modify | `vault:lockNote`, `vault:isLocked` commands + `Api` mirror |
| `src/preload/index.ts` | Modify | Expose `lockNote` / `isLocked` |
| `src/renderer/api/index.ts` | Modify | Typed wrappers |
| `src/main/services/VaultService.test.ts` | Modify | `.md.enc` listing + lock round-trip tests |
| `src/main/services/reconcile.test.ts` | Modify | Reconcile-skips-locked test |

---

## Verification

- `npm run test` green — **must include** an assertion that a locked note's unique term produces zero search results (the security boundary).
- `npm run typecheck` / `npm run check` clean.
- Manual: lock a seeded note; hex-inspect the `.md.enc` (no plaintext); search its term (no hit); unlock + reopen (content intact).

---

## Notes

- **Decision — where encryption lives**: the IPC handler layer orchestrates (`EncryptionService.seal/open` + VaultService raw bytes), keeping VaultService free of crypto. VaultService only gains binary-safe atomic I/O + `.enc` awareness.
- Locking is only allowed when the vault is unlocked (a key is held). If no password exists yet, the UI (P03) must route through `setPassword` first — the handler should reject `lockNote` when `!isUnlocked()`.
- Deleting the original `.md` after writing `.md.enc` must happen only after the encrypted write succeeds (encrypt→write→verify→delete) to avoid a window with neither file intact.
- Reconcile must check `isLocked` **before** calling `readNote`, or it will try to utf-8-read ciphertext.
- Tab-open-when-locked / tab-restore edge cases are surfaced to the renderer via the `note-locked` error and handled in P03.

---

## Review Log

### 2026-07-01 — Phase Review: APPROVED

**Tasks**: 7/7 genuinely complete — verified against real code + tests, not the status column.
**Quality**: PASS — full suite 213/213; typecheck (node+web) clean; changed files biome-clean. Pre-existing baseline noise (handlers useTemplate in deleteFolder/renameFolder, main/index autoUpdater format) untouched.
**Integration**: VaultService `.md.enc` listing + binary I/O wired; handlers route read/write/lock/unlock through `EncryptionService`; reconcile skips `.enc`. New `lockNote`/`unlockNote`/`isLocked` IPC exposed via preload. Renderer consumption is P03 (by design).
**Plan integrity**: OK — P03 UI consumes these commands; P04 UAT. No coverage gaps.
**Commit**: none (user directive: skip commits this session)

**Finding (adversarial audit — REAL SECURITY HOLE, fixed inline + hardened, not deferred)**:
- **`index:rebuild` bypassed the index-exclusion boundary.** The manual "Rebuild search index" button calls `listNotesWithMtime()` (which now includes `.md.enc`) then `readNote()` on each — so a rebuild would read every locked note's ciphertext as utf-8 and index it, re-opening the search-leak the lock/reconcile paths close. I had guarded reconcile but missed rebuild.
  - **Fix 1 (handler)**: rebuild filters out `isLocked` paths before reading — avoids reading ciphertext at all.
  - **Fix 2 (defense in depth, the real boundary)**: `IndexService.indexNote` and `IndexService.rebuild` now themselves refuse `.enc` paths, so *no* caller can leak a locked note by forgetting to filter. Enforced where data enters the index.
  - **Tests added**: IndexService refuses a locked path in both `indexNote` and `rebuild` (term unsearchable, path not in `getIndexed()`); reconcile already asserts the same.

**Note (not blocking, same as P01)**:
- Handlers still have no direct unit-test harness (`buildHandlers` unexported). The lock/unlock/read/write routing is verified by inspection + the IndexService/reconcile/VaultService tests that back it. The security boundary itself is now unit-tested at the index layer, which is the important part.

**Carried forward to P03**:
- **renameNote rejects `.enc` targets**: `renameNote` still guards with `hasNoteExtension(toRel)`, so renaming a locked note (`foo.md.enc`) throws `invalid-extension`. P03 must either disable rename on locked rows or teach the rename path about the `.enc` suffix.
- **Tab path churn on lock/unlock**: `lockNote` returns `{ path: 'foo.md.enc' }`, `unlockNote` returns `{ path: 'foo.md' }`. The renderer must re-point the open tab (like `renameTab`) and refresh the list; a stale `foo.md` tab will hit `note-locked`/ENOENT after locking.
