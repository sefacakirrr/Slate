# Epic 04: Search & Indexing — Planning

> Phase structure, dependencies, and progress tracking.
>
> **Status**: COMPLETE
> **Closed**: 2026-06-15

---

## Phase Overview

| Phase | Name | Goal | Dependencies | Status | Progress | Reviewed | Commit |
|---|---|---|---|---|---|---|---|
| 00 | Index Foundation | `IndexService` + FTS5 schema in `userData`; index/remove/rename one note; full rebuild from a content set; unit-tested against a temp db | None | COMPLETE | 7/7 | ✓ | uncommitted |
| 01 | Search Service | `SearchService` — FTS5 `MATCH` ranked queries with `snippet()`; user-input sanitization (never throws on bad query); unit-tested | Phase 00 | COMPLETE | 5/5 | ✓ | uncommitted |
| 02 | Wiring & Reconciliation | Instantiate index/search in main (db in `userData`); launch reconciliation (mtime compare); hook the 4 mutation handlers; `search:query` + `index:rebuild` IPC + preload/api | Phase 01 | COMPLETE | 8/8 | ✓ | uncommitted |
| 03 | Search UI | `Ctrl+Shift+F` search panel — query input, ranked results with snippet, click → `workspaceStore.openTab`; empty/no-results states | Phase 02 | COMPLETE | 6/6 | ✓ | uncommitted |
| 04 | Tests & Polish | Round out coverage (reconciliation, rename, rebuild, query-sanitization edges); dead-code sweep; full gate green | Phase 03 | COMPLETE | 5/5 | ✓ | uncommitted |
| 05 | User Acceptance Testing | User verifies search end-to-end against VISION success criteria | All phases | COMPLETE | 10/10 | ✓ (UAT) | uncommitted |

**Status values**: NOT STARTED → IN PROGRESS → COMPLETE
**Reviewed**: Set only by /epic-phase-review (mandatory before COMPLETE)
**Commit**: project directive is "no commits until ready" — reads "uncommitted" throughout, as in E1–E3.

---

## Critical Path

```
Phase 00 (IndexService + FTS5 schema)      ← the index engine; testable in isolation
   ↓
Phase 01 (SearchService + query sanitize)  ← reads the index; testable in isolation
   ↓
Phase 02 (Wiring: reconcile + hooks + IPC) ← the integration glue; main↔index↔IPC
   ↓
Phase 03 (Search UI: Ctrl+Shift+F panel)   ← renderer surface → openTab (E3)
   ↓
Phase 04 (Tests & polish)
   ↓
Phase 05 (UAT)
```

Strictly linear. Phases 00–01 are pure main-process services unit-tested against temp dbs (low risk, high confidence). Phase 02 carries the integration risk — index↔disk consistency, reconciliation correctness, and the IPC-contract extension. Phase 03 is additive renderer UI.

---

## Key Decisions (from /epic-create dialogue)

- **No file watcher.** Incremental indexing rides the four in-app mutation IPCs (`writeNote`/`createNote`/`deleteNote`/`renameNote`); external edits reconcile at next launch. The chokidar watcher is a separate future epic (also serves sidebar live-refresh). Carries the orphaned E1→E2 watcher deferral forward, now explicit.
- **No filters in v1.** Tags don't exist until E5; query → ranked results → open. No tag/folder filtering.
- **Own search surface** (`Ctrl+Shift+F` panel), not E7's command palette (unbuilt).
- **Raw markdown indexed as-is.** FTS5's `unicode61` tokenizer drops markdown punctuation naturally; no stripping pass.
- **Index in `userData/index.db`** — derived, rebuildable; vault stays clean markdown. Files remain source of truth.

---

## Schema Direction (finalized in Phase 00)

Path-keyed FTS5 so a note can be updated/removed by path and reconciliation can compare mtimes. Recommended: an external-content FTS5 table over a `notes` table —

```
notes(id INTEGER PRIMARY KEY, path TEXT UNIQUE NOT NULL, mtime INTEGER NOT NULL, content TEXT NOT NULL)
notes_fts USING fts5(content, content='notes', content_rowid='id')   -- kept in sync on write
```

`search` joins `notes_fts` back to `notes` for the path + `snippet()`. Phase 00 finalizes the exact sync mechanism (triggers vs explicit upsert).

---

## Native Prerequisite (resolved 2026-06-14)

VS Build Tools 2022 (C++) installed; `better-sqlite3` loads under Electron 33 ABI (130); FTS5 + `rank` + `snippet()` verified functional. Note for packaging (E10): rebuild *downloads* an Electron-ABI prebuilt — verify functionally, not by file timestamp.
