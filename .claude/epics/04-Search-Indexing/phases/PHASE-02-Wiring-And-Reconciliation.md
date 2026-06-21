# Phase 02: Wiring & Reconciliation

> **Status**: NOT STARTED
> **Dependencies**: Phase 01

---

## Goal

Wire the index/search services into the main process: open the db in `userData`, reconcile the index against disk at launch, keep it current by hooking the four mutation IPC handlers, and expose `search:query` + `index:rebuild` across the typed IPC boundary.

---

## Tasks

| # | Task | Status | Acceptance Criteria |
|---|------|--------|---------------------|
| 2.1 | Instantiate `IndexService` + `SearchService` in `main/index.ts` with `join(app.getPath('userData'), 'index.db')`; inject into the IPC handler deps; `close()` on quit | done | App launches; `userData/index.db` is created; no db left locked on exit |
| 2.2 | `VaultService.listNotesWithMtime()` (or extend listing) → `{path, mtime}[]`, reusing the same exclusion rules as `listNotes` | done | Returns the same paths as `listNotes` plus each file's mtime; covered by a VaultService test |
| 2.3 | Reconciliation on launch — compare disk `{path, mtime}` vs `IndexService.getIndexed()`: index new/changed (mtime newer), drop deleted; read content via `VaultService.readNote` | done | Cold start indexes an unindexed vault; an externally edited file is re-indexed; a deleted file leaves the index |
| 2.4 | Hook `writeNote` + `createNote` handlers → `indexNote(path, content, mtime)` after a successful write | done | Saving/creating a note makes its new content searchable without restart |
| 2.5 | Hook `deleteNote` → `removeNote(path)`; `renameNote` → `index.renameNote(from, to)` | done | Deleting drops it from results; renaming keeps content findable under the new path |
| 2.6 | IPC contract: add `search:query` (`{query} → {path, snippet, rank}[]`) and `index:rebuild` (`undefined → undefined`) to `shared/ipc.ts` + `Api`; register handlers | done | `typecheck` passes with the new channels; handlers wired in `registerIpcHandlers` |
| 2.7 | Expose `api.search.query` + `api.index.rebuild` through preload `contextBridge` and the renderer `api` types | done | `window.api.search.query(...)` typed and callable from renderer |
| 2.8 | Index updates are best-effort — a failing index write logs but never fails the user's save/IPC result | done | Forcing an index error still returns `ok:true` for the underlying vault mutation; error logged |

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/main/index.ts` | Modify | Construct services, db path, reconcile on launch, close on quit |
| `src/main/services/VaultService.ts` | Modify | `listNotesWithMtime()` |
| `src/main/services/VaultService.test.ts` | Modify | Cover the mtime listing |
| `src/main/ipc/handlers.ts` | Modify | Mutation hooks + `search:query` + `index:rebuild` handlers |
| `src/shared/ipc.ts` | Modify | New channels in `IpcCommands` + `Api` |
| `src/preload/index.ts` | Modify | Bridge `search` + `index` |
| `src/renderer/api/index.ts` (types) | Modify | Typed renderer access |

---

## Verification

`npm run check`, `npm run typecheck`, `npm run test`, `npm run build` green.

- Launch against a vault with no index → `index.db` populates; a `search:query` over a known word returns the note.
- Edit + save a note in-app → its new words are searchable immediately (no restart).
- Delete a note → it leaves results. Rename → findable under the new path.
- Edit a file **externally**, relaunch → reconciliation picks up the change.
- A simulated index failure leaves the vault write succeeding (best-effort).

---

## Notes

- **Reconciliation cost**: only re-index files whose mtime is newer than the indexed mtime (or absent). The first-ever launch indexes everything once — wrap it in a transaction; acceptable one-time cost for v1 (flag if a test vault is large enough to stutter).
- This is the **integration-risk phase** — the index↔disk contract lives here. Keep the choke point clean: mutation handlers update the index *after* the vault op succeeds, and index errors are swallowed-and-logged (task 2.8), never propagated to the user.
- The IPC wrapper already packages thrown errors into `IpcResult` — `search:query` sanitization (Phase 01) means it should rarely throw, but a thrown error still degrades to `ok:false`, which the UI treats as "no results".
- Mirror the existing handler/preload/api triad exactly — this contract extension is the same shape as E1/E3's.

---

## Review Log

### 2026-06-15 — Phase Review: APPROVED WITH EXCEPTIONS

**Tasks**: 8/8 genuinely complete, 0 stubs, 0 partial
**Quality**: PASS (97 tests incl. +9 this phase; typecheck node+web clean; build green; biome clean)
**Integration**: pipeline flows end-to-end — `reconcileIndex` called at launch (index.ts:78); 4 mutation handlers call `deps.index.*`; `search:query`/`index:rebuild` registered + preload-bridged; `SearchResult` crosses to the renderer (typecheck:web green confirms).
**Plan integrity**: OK — Phase 03 (Search UI) covers `api.search.query` → `openTab`; snippet marker styling already anticipated in task 3.2.
**Commit**: uncommitted (project directive, consistent with E1–E3).

**Findings**:
- Reconciliation logic extracted to a pure `reconcile.ts` (no Electron) so it unit-tests against a temp vault + db — `main/index.ts` only calls it. 5 reconcile tests cover cold start, deleted-file drop, external-edit re-index, unchanged no-op, new-file pickup.
- Index updates are best-effort by inspection (try/catch around stat+index in write/create; `tryIndex` for delete/rename) — a failing index write logs and leaves the vault IPC `ok:true`. No handler-level test (handlers.ts has never had a harness in this project); the underlying services are fully tested. Covered by Phase 04 (coverage) + Phase 05 (UAT).
- Reconcile-vs-hook race at launch analyzed: worst case is a transient stale mtime that self-heals next launch; VISION declares reconciliation self-healing. Non-issue for v1.
- Runtime instantiation (db creation in `userData`, `will-quit` close) is Electron-only → verified at UAT, correct by inspection.
- IPC decision: `search:query` request is a bare `string` (matches `readNote`/`createNote` single-param precedent), not `{query}`. No `limit` plumbed through IPC — server-side default 50; revisit in Phase 03 only if needed.

**Deferred / Exceptions**:
- **Fresh-vault-pick reconcile gap** — launch reconciliation runs only against the already-set vault; `setVaultPath` does not trigger reconciliation, so a vault picked first-time mid-session is unsearchable until relaunch. Non-blocking (relaunch self-heals; normal case unaffected). → **Destination: `.claude/backlog/tasks.md`** ([feature] medium, 2026-06-15). UAT advisory below.

### UAT Advisory (carry to Phase 05)
The fresh-vault-pick gap affects user-facing search. During UAT verify:
- With a vault already set at launch → query returns results for existing notes (the indexed/reconciled path). **Expected: works.**
- If testing a first-time vault pick or a vault switch mid-session → existing notes won't appear in search until relaunch. **Expected (known gap): empty until restart**, then correct. Confirm this matches the accepted v1 behavior or pull the backlog item forward.
