# Phase 00: Tag Extraction

> **Status**: NOT STARTED
> **Dependencies**: None

---

## Goal

Implement `extractTags(content): string[]` as a pure, unit-testable function that parses `#hashtag` patterns from markdown content with proper exclusions.

---

## Tasks

| # | Task | Status | Acceptance Criteria |
|---|------|--------|-------------------|
| 0.1 | Create `src/main/services/extractTags.ts` with the `extractTags` function | pending | Function exists, exports correctly, handles empty/null input |
| 0.2 | Implement code fence exclusion (``` blocks stripped before tag scan) | pending | Tags inside fenced code blocks are NOT extracted |
| 0.3 | Implement inline code exclusion (backtick spans stripped) and URL fragment exclusion | pending | `C#`, `` `#foo` ``, `http://x.com#sec` not treated as tags |
| 0.4 | Create `src/main/services/extractTags.test.ts` with comprehensive tests | pending | All parse rules from VISION §7 covered; edge cases tested |

**Status values**: pending → in_progress → done

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/main/services/extractTags.ts` | Create | Pure tag extraction function |
| `src/main/services/extractTags.test.ts` | Create | Unit tests for extraction |

---

## Parse Rules (from VISION §7)

1. Word boundary: `#` preceded by start-of-line, whitespace, or punctuation
2. Min length: at least 2 chars after `#`
3. First char must be a letter (no `#123`)
4. Allowed chars: letter, digit, hyphen, underscore
5. Exclusions: fenced code blocks, inline code, URLs
6. Case-insensitive normalize → lowercase
7. Max 64 chars (ignore longer)
8. Deduplicate results (return unique set)

---

## Verification

- `npm run test` — extractTags tests pass
- `npm run check` — no lint errors
- `npm run typecheck:node` — types clean

---

## Notes

- This is a pure function with zero dependencies on SQLite, Electron, or any service. Can be developed and tested in isolation.
- Consider: markdown headings (`# Heading`) are NOT tags — they have a space after `#`. The regex must require the tag body to start immediately after `#` with no space.

---

## Review Log

_Populated by /epic-phase-review._
