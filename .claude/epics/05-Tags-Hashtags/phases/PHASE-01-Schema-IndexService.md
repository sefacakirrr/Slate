# Phase 01: Schema & IndexService

> **Status**: NOT STARTED
> **Dependencies**: Phase 00

---

## Goal

Add `tags` + `note_tags` tables to the SQLite schema and implement `syncTags()` on IndexService that keeps tag associations in sync with note content on every index operation.

---

## Tasks

| # | Task | Status | Acceptance Criteria |
|---|------|--------|-------------------|
| 1.1 | Add `tags` and `note_tags` tables to `IndexService.bootstrap()` | pending | Tables created idempotently; index on `note_tags(tag_id)` for join perf |
| 1.2 | Implement `IndexService.syncTags(path, tags[])` — diff-based upsert | pending | Given a note path + extracted tags: inserts new tags, removes stale associations, no-ops on unchanged |
| 1.3 | Call `syncTags` from `indexNote()` (extract + sync in one shot) | pending | Every `indexNote` call also syncs that note's tags |
| 1.4 | Handle tag cleanup in `removeNote()` and `rebuild()` | pending | Deleting a note cascades to `note_tags`; rebuild clears and re-syncs all tags |
| 1.5 | Create `src/main/services/IndexService.test.ts` additions for tag sync | pending | Tests: indexNote syncs tags, removeNote cascades, rebuild re-syncs, rename preserves tags |

**Status values**: pending → in_progress → done

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/main/services/IndexService.ts` | Modify | Add schema, `syncTags()`, integrate into `indexNote`/`removeNote`/`rebuild` |
| `src/main/services/IndexService.test.ts` | Modify | Add tag-related test cases |

---

## Schema Design

```sql
CREATE TABLE IF NOT EXISTS tags (
  id   INTEGER PRIMARY KEY,
  name TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS note_tags (
  note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  tag_id  INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (note_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_note_tags_tag ON note_tags(tag_id);
```

## syncTags Algorithm

```
syncTags(path, newTags[]):
  1. Get note id from notes table by path
  2. If note not found → return (race with delete, harmless)
  3. Get current tag names for this note (JOIN note_tags + tags)
  4. toAdd = newTags - currentTags
  5. toRemove = currentTags - newTags
  6. For each in toAdd: INSERT OR IGNORE into tags; INSERT into note_tags
  7. For each in toRemove: DELETE from note_tags
  8. (Optional cleanup: DELETE from tags WHERE id NOT IN (SELECT tag_id FROM note_tags))
     → Skip for now; orphan tags are harmless and get cleaned on rebuild
```

---

## Verification

- `npm run test` — all IndexService tests pass (existing + new)
- `npm run typecheck:node` — types clean
- `npm run check` — lint clean

---

## Notes

- CASCADE ON DELETE on `note_tags.note_id` means `removeNote` (which DELETEs from `notes`) automatically removes junction rows. No explicit tag cleanup needed on delete.
- `rebuild()` does `DELETE FROM notes` which cascades to `note_tags`. After re-inserting notes, we re-call `syncTags` for each. Simple but correct.
- Orphan tags (in `tags` table but no `note_tags` rows) are harmless — they won't appear in `tags:list` because the query JOINs. We can clean them periodically or on rebuild.

---

## Review Log

_Populated by /epic-phase-review._
