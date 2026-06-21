# Epic 05: Tags & Hashtags — Planning

> Phase structure, dependencies, and progress tracking.

---

## Phase Overview

| Phase | Name | Goal | Dependencies | Status | Progress | Reviewed | Commit |
|-------|------|------|-------------|--------|----------|----------|--------|
| 00 | Tag Extraction | Pure `extractTags(content)` function + unit tests | None | COMPLETE | 4/4 | | uncommitted |
| 01 | Schema & IndexService | `tags`+`note_tags` tables, `syncTags()` method, rebuild integration | Phase 00 | COMPLETE | 5/5 | | uncommitted |
| 02 | IPC & Wiring | `tags:list` + `tags:notesForTag` channels, handler registration, preload exposure | Phase 01 | COMPLETE | 5/5 | | uncommitted |
| 03 | Sidebar Tags UI | `tagsStore` + Sidebar "Tags" section + tag click → filtered results | Phase 02 | COMPLETE | 5/5 | | uncommitted |
| 04 | Tests & Polish | Full test suite, automated gate, edge case coverage | Phase 03 | COMPLETE | 4/4 | | uncommitted |
| 05 | User Acceptance Testing | User verifies epic end-to-end | All phases | COMPLETE | 9/9 | | uncommitted |

**Status values**: NOT STARTED → IN PROGRESS → COMPLETE
**Reviewed**: Set only by /epic-phase-review (mandatory before COMPLETE)
**Commit**: uncommitted (project directive)

---

## Critical Path

```
Phase 00 (extractTags) → Phase 01 (schema + syncTags) → Phase 02 (IPC) → Phase 03 (UI) → Phase 04 (tests) → Phase 05 (UAT)
```

---

## Design Notes

- **No separate TagService class.** Tag extraction is a pure function (`extractTags`). Storage/sync lives as methods on `IndexService`. This avoids a new service class + DI wiring for ~50 lines of logic.
- **Junction table (normalize).** `tags` (id, name UNIQUE) + `note_tags` (note_id, tag_id, PRIMARY KEY). Enables future rename/merge. CASCADE on delete keeps orphans clean.
- **Diff-based sync.** `syncTags` compares current DB tags for a note vs extracted tags. Only inserts new / removes stale — avoids DELETE ALL + re-INSERT on every save.
- **Tag click → SearchPanel results.** Clicking a tag in sidebar opens the search panel with results pre-populated from `tags:notesForTag`. Reuses existing search result rendering (no new list component needed).
