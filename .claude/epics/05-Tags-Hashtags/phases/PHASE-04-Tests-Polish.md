# Phase 04: Tests & Polish

> **Status**: NOT STARTED
> **Dependencies**: Phase 03

---

## Goal

Full test coverage for the tag pipeline, automated gate green, edge cases hardened.

---

## Tasks

| # | Task | Status | Acceptance Criteria |
|---|------|--------|-------------------|
| 4.1 | Integration tests: `indexNote` → `listTags` → `notesForTag` round-trip | pending | End-to-end data flow verified in test |
| 4.2 | Edge case tests: Unicode tags, max length, duplicate normalization, empty content | pending | All edge cases pass |
| 4.3 | Reconciliation test: verify tags re-sync on reindex | pending | After reconcile, tags match current content (not stale) |
| 4.4 | Full automated gate: `check` + `typecheck` + `test` + `build` | pending | All exit 0 with zero warnings |

**Status values**: pending → in_progress → done

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/main/services/IndexService.test.ts` | Modify | Add integration tests for tag round-trip |
| `src/main/services/extractTags.test.ts` | Modify | Add edge case tests (Unicode, length, duplicates) |
| `src/main/services/reconcile.test.ts` | Modify | Add test verifying tags are synced during reconciliation |

---

## Test Cases to Add

### extractTags edge cases
- Unicode: `#café`, `#über`, `#日本語` (if letter-class includes Unicode)
- Max length: 64-char tag preserved, 65-char tag ignored
- Duplicates: `#foo #FOO #Foo` → single `["foo"]`
- Adjacent: `#one#two` → only `#one` (second `#` not at word boundary)
- Heading confusion: `# Heading` → no tag; `## Heading` → no tag
- List item: `- #tag in a list` → extracts `tag`
- Mixed content: tags + code blocks + URLs in one document

### IndexService integration
- Index 3 notes with overlapping tags → `listTags` returns correct counts
- Remove a note → tag count decreases; orphan tag disappears from list
- Update a note (remove a tag) → count updates
- Rename a note → tags preserved (same note_id, path changed)

### Reconciliation
- Create index with note A (has `#foo`), modify A's content on disk (now has `#bar`), reconcile → tags updated to `#bar`

---

## Verification

```bash
npm run check && npm run typecheck && npm run test && npm run build
```

All exit 0. No skipped tests, no warnings.

---

## Notes

- This phase is about confidence, not features. No user-visible behavior changes.
- If any test reveals a bug in Phases 00–03, fix it here and note it in the review log.

---

## Review Log

_Populated by /epic-phase-review._
