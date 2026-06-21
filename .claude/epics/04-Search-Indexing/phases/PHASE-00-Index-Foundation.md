# Phase 00: Index Foundation

> **Status**: COMPLETE
> **Dependencies**: None

---

## Goal

Build `IndexService` — the SQLite FTS5 index engine — with a path-keyed schema and single-note index/remove/rename plus a full rebuild, all unit-tested against a temp database in isolation (no IPC, no vault wiring yet).

---

## Tasks

| # | Task | Status | Acceptance Criteria |
|---|------|--------|---------------------|
| 0.1 | `IndexService` class owning a `better-sqlite3` connection; constructor takes an explicit db file path (injectable, so tests use a temp file / `:memory:`) | done | `new IndexService(dbPath)` opens/creates the db; a `close()` releases it |
| 0.2 | Schema bootstrap on first open — `notes` table (`id`, `path UNIQUE`, `mtime`, `content`) + external-content `notes_fts` FTS5 over `content`; idempotent (safe to re-open) | done | Re-opening an existing db doesn't error or duplicate; `notes_fts` is queryable |
| 0.3 | `indexNote(path, content, mtime)` — upsert: insert a new note or update content+mtime of an existing path, keeping `notes_fts` in sync | done | After indexing, a `MATCH` on a word in content returns the row; re-indexing the same path updates, not duplicates |
| 0.4 | `removeNote(path)` — delete the note + its FTS row; tolerant of an unknown path | done | Removed note no longer matches; removing a missing path is a no-op |
| 0.5 | `renameNote(from, to)` — re-point a note's path, preserving its indexed content | done | After rename, content matches under the new path and not the old; content unchanged |
| 0.6 | `rebuild(entries)` — clear and re-index from a provided set of `{path, content, mtime}` in one transaction; `getIndexed()` → `{path, mtime}[]` for reconciliation use | done | After rebuild the index contains exactly the provided set; `getIndexed()` lists them with mtimes |
| 0.7 | `IndexService.test.ts` — Vitest against a temp db covering 0.3–0.6 incl. upsert-not-duplicate, FTS sync on update, rename isolation, rebuild replaces wholesale | done | `npm run test` green (11 tests); tests assert via `MATCH` queries, not internal state |

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/main/services/IndexService.ts` | Create | The FTS5 index engine |
| `src/main/services/IndexService.test.ts` | Create | Unit coverage against a temp db |

---

## Verification

`npm run check`, `npm run typecheck:node`, `npm run test` green. Tests run in plain Node (Vitest) — `better-sqlite3` loads under Node's ABI for tests (the Electron-ABI binary is only needed at app runtime), so the temp-db tests run without Electron.

- After indexing two notes, a `MATCH` for a word in one returns only that note.
- Re-indexing a path with new content: old terms no longer match, new terms do, row count unchanged.
- `rebuild` with a fresh set drops everything not in the set.

---

## Notes

- **Schema**: external-content FTS5 (`content='notes', content_rowid='id'`) is the recommended path — keep `notes_fts` in sync via the standard `INSERT INTO notes_fts(notes_fts, rowid, content) VALUES('delete', old.id, old.content)` + insert dance, or SQLite triggers. Finalize the mechanism here; document the choice in code comments.
- Keep `IndexService` **decoupled from `VaultService`** — it receives `content`/`mtime`, never reads the disk itself. Reading files is the coordinator's job (Phase 02). This is what makes it unit-testable.
- `better-sqlite3` is synchronous — wrap multi-row work (`rebuild`) in a single transaction (`db.transaction(...)`) for speed and atomicity.
- Sanitize nothing here — raw content in, raw `MATCH` is Phase 01's concern.
- Mirror `SettingsService`/`VaultService` conventions: class owning a resource, throw on real errors, no Electron import.

### Resolved during implementation — test runtime (affects all E4 phases)

The rebuilt `better-sqlite3` is an **Electron-ABI (130)** binary; it will NOT load under the system Node (137) that plain `vitest` uses, so any test importing it failed at module load. Fix: `npm test`/`test:watch` now run Vitest under Electron's Node via `scripts/run-vitest-electron.mjs` (`ELECTRON_RUN_AS_NODE=1 electron vitest`). One binary, one ABI; the existing 68 node-based tests run fine under it too (verified — 79 total green). Any future test touching the index/search layer must go through this runner (already wired into the npm scripts).

---

## Review Log

### 2026-06-15 — Phase Review: APPROVED

**Tasks**: 7/7 genuinely complete, 0 stubs, 0 partial
**Quality**: PASS (79/79 tests, typecheck:node clean, biome clean, no TODO/FIXME at impl sites)
**Integration**: 0/1 connected — `IndexService` is intentionally unwired; Phase 02 instantiates it in main and hooks the 4 mutation handlers. `connection` getter exposed for Phase 01's SearchService. Forward design correct.
**Plan integrity**: OK — Phases 01–05 cover the full path with no vision gaps.
**Commit**: uncommitted (project directive — "no commits until ready", consistent with E1–E3).

**Findings**:
- Trigger-based external-content FTS5 sync chosen over explicit upsert; documented in code comments (IndexService.ts:56). Clean choice — every `notes` mutation flows through plain SQL and the index follows automatically.
- Tests assert observable search behavior (`MATCH` via `paths()` helper), not internal table state — exactly as the phase required. Upsert-no-duplicate, FTS term-drop-on-update, rename isolation, and wholesale rebuild all covered.
- Minor: `renameNote`'s "throws if `to` already taken" doc claim is accurate (UNIQUE constraint) but has no dedicated test. Acceptance criteria didn't require it; not deferred.

**Deferred**: none.
