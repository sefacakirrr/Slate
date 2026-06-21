# Current: Phase 05 — User Acceptance Testing

## What to Do

All implementation (Phases 00–04) is complete and the automated gate is green (153 tests). Phase 05 is **user-driven**: run `npm run dev` and walk the 9 scenarios in `phases/PHASE-05-UAT.md`.

## Implementation Summary

- **extractTags** (`src/main/services/extractTags.ts`): Pure function — strips code fences, inline code, URLs, then scans for `#tag` patterns. Case-insensitive normalize, min 2 chars, letter-start, max 64 chars. 30+ unit tests.
- **Schema** (`IndexService.bootstrap()`): `tags` (id, name UNIQUE) + `note_tags` (note_id, tag_id) junction with CASCADE delete + index.
- **syncTags** (`IndexService`): Diff-based — compares DB state vs extracted, applies only delta. Called from `indexNote()` and `rebuild()`.
- **IPC**: `tags:list` → `TagInfo[]`, `tags:notesForTag` → `string[]`. Wired through handlers + preload.
- **Sidebar Tags section**: Shows tags as clickable badges with count. Max 50 visible, "Show all" expansion. Refreshes after save/delete.
- **Tag click flow**: `api.tags.notesForTag(tag)` → `searchStore.showTagResults(tag, paths)` → SearchPanel opens with pre-populated results.

## How to Run UAT

1. `npm run dev`
2. Walk scenarios 1–9 in `phases/PHASE-05-UAT.md`
3. Record pass/fail per scenario

## Watch For

- **Scenario 7 (code block)**: `#include` inside ``` should NOT appear as a tag
- **Scenario 8 (URL)**: `http://example.com#section` should NOT produce "section" tag
- **Scenario 9 (case-insensitive)**: `#JavaScript` and `#JAVASCRIPT` → single "javascript" entry
- **Tag refresh**: after Ctrl+S, sidebar should update within ~200ms (IPC round-trip)
