# Phase 02: IPC & Wiring

> **Status**: NOT STARTED
> **Dependencies**: Phase 01

---

## Goal

Expose tag data to the renderer via typed IPC channels: `tags:list` (all tags with counts) and `tags:notesForTag` (paths for a given tag). Wire through shared types → handlers → preload → renderer API.

---

## Tasks

| # | Task | Status | Acceptance Criteria |
|---|------|--------|-------------------|
| 2.1 | Add `TagInfo` type to `src/shared/types.ts` | pending | `{ name: string; count: number }` exported |
| 2.2 | Add `tags:list` and `tags:notesForTag` channels to `src/shared/ipc.ts` + Api type | pending | IPC contract includes both channels with correct request/response types |
| 2.3 | Add query methods to `IndexService`: `listTags()` and `notesForTag(tag)` | pending | SQL queries return correct data (JOIN note_tags + tags with GROUP BY count) |
| 2.4 | Register handlers in `src/main/ipc/handlers.ts` | pending | Both channels wired to IndexService methods via deps |
| 2.5 | Expose in `src/preload/index.ts` and update `renderer/api/window.d.ts` if needed | pending | `window.api.tags.list()` and `window.api.tags.notesForTag(tag)` callable from renderer |

**Status values**: pending → in_progress → done

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/shared/types.ts` | Modify | Add `TagInfo` type |
| `src/shared/ipc.ts` | Modify | Add channels + Api.tags section |
| `src/main/services/IndexService.ts` | Modify | Add `listTags()` and `notesForTag()` query methods |
| `src/main/ipc/handlers.ts` | Modify | Wire tag handlers |
| `src/preload/index.ts` | Modify | Expose `api.tags` |

---

## IPC Design

```typescript
// shared/ipc.ts additions
'tags:list': { request: undefined; response: TagInfo[] }
'tags:notesForTag': { request: string; response: string[] }

// Api type addition
tags: {
  list: () => Promise<IpcResult<TagInfo[]>>
  notesForTag: (tag: string) => Promise<IpcResult<string[]>>
}
```

## SQL Queries

```sql
-- listTags: all tags with count, ordered by count DESC then name ASC
SELECT t.name, COUNT(nt.note_id) AS count
FROM tags t
JOIN note_tags nt ON nt.tag_id = t.id
GROUP BY t.id
ORDER BY count DESC, t.name ASC;

-- notesForTag: note paths for a given tag name
SELECT n.path
FROM notes n
JOIN note_tags nt ON nt.note_id = n.id
JOIN tags t ON t.id = nt.tag_id
WHERE t.name = ?
ORDER BY n.path;
```

---

## Verification

- `npm run typecheck` — both projects (node + web) clean
- `npm run check` — lint clean
- Manual: in devtools `await window.api.tags.list()` returns `{ ok: true, data: [...] }`

---

## Notes

- `listTags` uses JOIN (not LEFT JOIN) so orphan tags with zero notes don't appear.
- `notesForTag` returns paths only — renderer can open them via `openTab(path)`.
- The handler for `tags:notesForTag` normalizes the input to lowercase (matching the extraction normalization).

---

## Review Log

_Populated by /epic-phase-review._
