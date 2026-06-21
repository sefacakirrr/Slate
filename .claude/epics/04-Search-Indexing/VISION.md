# Epic 04: Search & Indexing

> **Status**: COMPLETE (2026-06-15)
> **Created**: 2026-06-14

---

## 1. Summary

**Problem**: There is no way to find a note by its content. The sidebar file tree is the only way to locate a note, which means the user must remember a note's filename and folder. As the vault grows past a few dozen notes, content the user knows they wrote becomes effectively unfindable.

**Vision**: A local full-text search over every note. Type a query, get ranked results with highlighted snippets, click one to open it in a tab. Backed by SQLite FTS5, the index is maintained incrementally as notes change inside the app and reconciled against disk at launch. The index is a derived, rebuildable artifact in `userData`; the markdown files on disk remain the single source of truth.

**Key Deliverables**:
1. **IndexService** (main) — SQLite FTS5 schema in `userData`; index / remove / rename a note; launch reconciliation scan; manual rebuild.
2. **SearchService** (main) — FTS5 `MATCH` queries → ranked results with snippets.
3. **IPC additions** — `search:query`, `index:rebuild` (and a status/ready signal if needed).
4. **Incremental indexing hooks** — the four mutation IPC handlers (`writeNote` / `createNote` / `deleteNote` / `renameNote`) update the index for the affected path.
5. **Search UI** (renderer) — a `Ctrl+Shift+F` panel: query input, ranked results list with snippet, click → `workspaceStore.openTab`.

---

## 2. Exploration Findings

> Codebase exploration performed 2026-06-14 via /epic-create (direct inspection; author implemented E1–E3).

### Relevant Components
- **`main/services/VaultService.ts`** — read-side vault ops (`listNotes` returns sorted vault-relative paths; `readNote`; mutations `writeNote`/`createNote`/`deleteNote`/`renameNote`). Pure Node, path-safe via `resolveSafe`, unit-tested against temp dirs. `listNotes` excludes `_`/`.`-prefixed segments (so `_attachments/`, `.git/` are already hidden — the index inherits this).
- **`main/ipc/handlers.ts`** — all mutations funnel through one `buildHandlers` map with a cached `VaultService`. This is the single choke point where in-app changes happen — the natural place to fire incremental index updates.
- **`main/services/SettingsService.ts`** — pattern to mirror for a main-process service owning a file resource (here: the SQLite connection). `app.getPath('userData')` is already used in `main/index.ts` for `settings.json`.
- **`renderer/stores/workspaceStore.ts`** — `openTab(path)` opens or focuses a tab. Search results integrate here directly: click a result → `openTab(result.path)`.
- **`shared/ipc.ts`** — typed IPC contract (`IpcCommands` + `Api`), `IpcResult<T>` discriminated union. New search/index channels slot in here.

### Current Implementation
- Native module verified working: `better-sqlite3` loads under Electron 33's ABI (130); **FTS5 + `rank` ordering + `snippet()` all confirmed functional** (tested 2026-06-14). `chokidar` is a dependency but **unused** — no file watcher exists anywhere in `src/`.
- Vault changes today are reflected only by explicit `listNotes()` calls (on launch and after in-app mutations). There is no live external-change detection.

### Gaps Identified
- No index, no search service, no search UI — entirely greenfield within an established main/renderer/IPC structure.
- `VaultService.listNotes()` returns paths only, no `mtime`/size — reconciliation needs per-file modification time to detect external changes cheaply (add a listing-with-stat path, or have IndexService stat each file).

### Patterns to Follow
- Main service owning a stateful resource = a class (like `SettingsService`/`VaultService`); renderer reaches it only through typed IPC; errors thrown at the service layer, caught and packaged as `IpcResult<T>` at the IPC boundary.
- SQLite db in `userData` (derived/rebuildable), never in the vault. Source of truth stays on disk.

---

## 3. Architecture

### Current State
```
files on disk ──(listNotes/readNote)──> VaultService ──IPC──> vaultStore (sidebar)
in-app edits ──(write/create/delete/rename IPC)──> VaultService ──> disk
no index, no search, no watcher
```

### Target State
```
SOURCE OF TRUTH: markdown files on disk
DERIVED INDEX:   userData/index.db  (SQLite FTS5)

Launch:
  reconciliation scan — list notes + mtime on disk vs index;
  (re)index new/changed, drop rows for deleted files  → self-healing

In-app mutation (handlers.ts choke point):
  writeNote/createNote → index that path's content
  deleteNote           → remove that path from index
  renameNote           → move/re-index under new path

Search:
  renderer (Ctrl+Shift+F panel) ──IPC search:query(text)──>
    SearchService: FTS5 MATCH, ORDER BY rank, snippet() per hit ──>
    [{ path, snippet, rank }] ──> results list ──click──> workspaceStore.openTab(path)

Manual rebuild:
  index:rebuild — drop + rebuild the whole index from disk
```

- **Index schema** (decided in /epic-plan): a path-keyed FTS5 table (e.g. an external-content/standalone FTS5 `notes_fts(content)` + a `notes(path PRIMARY KEY, mtime)` side table mapping path↔rowid) so a note can be updated/removed by path and reconciliation can compare mtimes.
- **Raw markdown is indexed as-is.** FTS5's default `unicode61` tokenizer splits on non-alphanumeric characters, so markdown punctuation (`**`, `#`, `-`) mostly falls away naturally — no markdown-stripping pass needed for v1.

---

## 4. Success Criteria

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | Typing a query in the search panel returns ranked results with snippets in < 2s on a 500-note corpus | Manual: seed/point at a ~500-note vault, query, observe latency + ranking |
| 2 | Clicking a result opens that note in a tab (focused), via the E3 workspace | Manual: click a result → correct note opens as active tab |
| 3 | Saving / creating / deleting / renaming a note in-app updates search results without a restart | Manual: edit a note, re-query, see updated content; delete a note, it leaves results |
| 4 | A note changed outside the app is reflected after relaunch (reconciliation) | Manual: edit a file externally, relaunch, query → updated content appears |
| 5 | The index lives in `userData`, not the vault; the vault contains only markdown | Inspect: `userData/index.db` exists; vault has no db/index files |
| 6 | Manual rebuild reconstructs the index from disk with identical results | Manual: trigger rebuild, re-query → same results |
| 7 | `npm run check && typecheck && test && build` green; IndexService + SearchService unit-tested against a temp db/vault | Automated gate + new Vitest suites |

---

## 5. Scope

### In Scope
- `IndexService` — FTS5 schema in `userData`; index/remove/rename one note; launch reconciliation (mtime-based); manual rebuild.
- `SearchService` — FTS5 `MATCH` ranked queries with `snippet()`.
- IPC: `search:query`, `index:rebuild`; wire the four mutation handlers to update the index.
- Reconciliation needs file mtimes — extend the vault listing (or stat in IndexService).
- Search UI: `Ctrl+Shift+F` panel — input, ranked results with snippet, click → `openTab`.
- Index db in `userData`; vault stays clean markdown.
- Unit tests for IndexService + SearchService (temp db + temp vault).

### Out of Scope
- **chokidar file watcher / live external-change indexing** — its own concern (also serves sidebar live-refresh, not just search). Building it here violates one-epic-one-problem. External edits reconcile at next launch; the watcher is a separate future epic. *(Carrying the orphaned E1→E2 watcher deferral forward explicitly.)*
- **Tag / folder filters** — tags don't exist until E5; folder filtering deferred. v1 is query → ranked results → open.
- **Command-palette integration (Ctrl+K)** — E7's surface, not built. E4 ships its own `Ctrl+Shift+F` panel.
- **Fuzzy / typo-tolerant / regex search, search-and-replace** — FTS5 is token/prefix-based; advanced matching is a later refinement.
- **Markdown-aware indexing** (stripping syntax, weighting headings) — raw indexing is sufficient for v1; revisit if result quality demands it.

---

## 6. Risks & Open Questions

| Risk | Impact | Mitigation |
|------|--------|------------|
| Index ↔ disk drift if a mutation path isn't hooked or an in-app write fails mid-index | Stale or missing search results | Launch reconciliation scan is self-healing (mtime compare re-syncs); manual rebuild as the escape hatch. Index updates are best-effort and never block the user's save. |
| Initial index build / rebuild cost on a large vault | First launch or rebuild could briefly block the main process (better-sqlite3 is synchronous) | Batch inserts in a transaction; reconciliation only re-indexes changed files (mtime), not everything. If needed, chunk the work; flag if a vault is large enough to need backgrounding. |
| `mtime` granularity / clock skew misses a same-second external edit | A rare external change not re-indexed at launch | mtime is sufficient for the personal single-user case; manual rebuild covers the edge. Hashing is the heavier fallback if this ever bites. |
| Packaged-app native module: electron-builder must ship the Electron-ABI `better-sqlite3` binary | Search dead on installed builds even though dev works | Verify in E10 packaging; `electron-builder` rebuilds native deps for the target. Flag now, confirm at package time. Note: rebuild *downloads* a prebuilt binary (see backlog note) — verify functionally, not by file timestamp. |
| FTS5 query-syntax errors from raw user input (e.g. unbalanced quotes, bare `*`) | A thrown error instead of results | Wrap/escape the user query (quote-phrase or sanitize FTS5 special chars) in SearchService; return empty results, never crash. |
| Search UI surface with no command palette yet | Risk of over-building a palette to host search | Ship a dedicated `Ctrl+Shift+F` panel now; let E7 fold search into the palette later if desired. |
