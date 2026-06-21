# Phase 01: Search Service

> **Status**: COMPLETE
> **Dependencies**: Phase 00

---

## Goal

Build `SearchService` — ranked FTS5 `MATCH` queries with snippets — on top of the Phase 00 index, with user-input sanitization that never throws on malformed query text. Unit-tested in isolation.

---

## Tasks

| # | Task | Status | Acceptance Criteria |
|---|------|--------|---------------------|
| 1.1 | `SearchService` constructed with the same `better-sqlite3` connection (or an `IndexService` handle exposing it) — reads only, never writes | done | `new SearchService(db)` then `search(q)` returns rows; no schema writes |
| 1.2 | `search(query, limit?)` → `{ path, snippet, rank }[]` ordered by FTS5 `rank`, joining `notes_fts` back to `notes` for the path | done | A query returns matching notes best-first; non-matching notes absent |
| 1.3 | `snippet()` per hit — highlighted match window with ellipses, bounded length | done | Result snippet contains the matched term wrapped in the chosen delimiters |
| 1.4 | Query sanitization — wrap/escape raw user input so FTS5 special syntax (unbalanced `"`, bare `*`, `(`, `:`) can't raise an error; empty/whitespace query → empty results | done | Bad inputs (`"`, `foo(`, `*`, ``) return `[]` (or safe matches), never throw |
| 1.5 | `SearchService.test.ts` — seed an index, assert ranking order, snippet contents, multi-term, no-match → `[]`, and the bad-input cases from 1.4 | done | `npm run test` green |

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/main/services/SearchService.ts` | Create | Ranked FTS5 query + snippet |
| `src/main/services/SearchService.test.ts` | Create | Ranking, snippet, and sanitization coverage |

---

## Verification

`npm run check`, `npm run typecheck:node`, `npm run test` green.

- Seed 3 notes; a single-term query returns the relevant ones ordered by rank.
- A two-term query narrows correctly.
- Each of the malformed inputs in 1.4 returns without throwing.

---

## Notes

- **Sanitization approach**: the simplest robust path is to tokenize the user string and rebuild a safe FTS5 query — e.g. split on whitespace, drop/escape FTS5 special characters, and join terms (optionally with a trailing `*` on the last token for prefix-as-you-type). Decide phrase vs prefix behavior here; document it. The hard requirement is **never surface an FTS5 syntax error to the user**.
- Keep `SearchService` read-only and stateless beyond the db handle — it pairs with `IndexService` but doesn't own the connection's lifecycle.
- Decide a sane default `limit` (e.g. 50) to bound result rendering in Phase 03.
- No markdown-aware ranking/weighting — raw content, default tokenizer (per VISION).

---

## Review Log

### 2026-06-15 — Phase Review: APPROVED

**Tasks**: 5/5 genuinely complete, 0 stubs, 0 partial
**Quality**: PASS (88/88 tests, typecheck node+web clean, build green, biome clean, no TODO/stub markers)
**Integration**: 0/1 connected — `SearchService` intentionally unwired; Phase 02 adds the `search:query` IPC. `SearchResult` (new in `shared/types.ts`) is referenced as the service return type, not dead.
**Plan integrity**: OK with two forward warnings (below).
**Commit**: uncommitted (project directive, consistent with E1–E3).

**Findings**:
- Sanitization directly closes the VISION §6 FTS5-syntax-error risk. `toMatchQuery` strips `"`, drops punctuation-only tokens, wraps each survivor in `"..."` (turning FTS5 operators into literal tokenizer input), and appends a single trailing `*` for as-you-type prefix. The output is always valid FTS5; no constructed input broke it (tests cover `"`, `*`, `()`, `foo(`, `foo"bar`, `foo:bar`, `NEAR(a b)`, `a AND OR *`).
- `import type Database` keeps `SearchService.ts` importable without loading the native binary; the live connection arrives via the constructor.
- Snippet sentinels are PUA code points `U+E000`/`U+E001` (`SNIPPET_MARK_OPEN`/`_CLOSE`) — collision-free against markdown punctuation.

**Plan-integrity warnings (carried to Phase 02 CURRENT.md, non-blocking)**:
1. The VISION §2 mtime gap (`listNotes()` returns paths only) is **already covered** by Phase 02 task 2.2 (`listNotesWithMtime`) — verified on re-read of the phase file; no plan revision needed. Flagged only so the implementer treats 2.2 as a hard prerequisite for the 2.3 reconciliation.
2. Snippet sentinel coupling: the renderer can't import the SearchService marker consts (Node boundary) and `shared` is types-only. Phase 02 task 2.6 ships `snippet` as a raw string over IPC; Phase 03 must decide how the `U+E000`/`U+E001` marker values reach the UI to highlight (hardcode the pair in the renderer, or split server-side into structured spans).

**Deferred**: none.
