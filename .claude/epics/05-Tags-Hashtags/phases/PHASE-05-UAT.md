# Phase 05: User Acceptance Testing

> **Status**: COMPLETE
> **Dependencies**: All implementation phases
> **Note**: Only the user can mark this phase complete.

---

## Goal

User verifies the tags feature works end-to-end in the running app.

---

## Test Scenarios

| # | Scenario | Expected Result | Status |
|---|----------|-----------------|--------|
| 1 | Create a note, type `#javascript` and `#react`, press Ctrl+S | Both tags appear in the sidebar Tags section with count 1 | PASS |
| 2 | Open another note, add `#javascript`, save | Sidebar shows "javascript (2)", "react (1)" | PASS |
| 3 | Click "javascript" in the sidebar Tags section | Search panel opens showing both notes that have `#javascript` | PASS |
| 4 | Click a result in the search panel | That note opens in the editor | PASS |
| 5 | Remove `#javascript` from the second note, save | "javascript" count drops to 1 | PASS |
| 6 | Delete the first note (which had both tags) | "javascript" disappears from tags (count was 1); "react" disappears too | PASS |
| 7 | Create a note with a fenced code block containing `#include <stdio.h>` | "include" does NOT appear in the tags list | PASS |
| 8 | Create a note with `Visit http://example.com#section for details` | "section" does NOT appear in the tags list | PASS |
| 9 | Type `#JavaScript` and `#JAVASCRIPT` in the same note, save | Only one entry "javascript (1)" in sidebar (case-insensitive dedup) | PASS |

---

## Acceptance Checklist

From VISION.md Section 4 — Success Criteria:

- [x] Note save → tag appears in sidebar (criterion 1)
- [x] Tag click → filtered note list (criterion 2)
- [x] Note delete → tag count updates / tag disappears (criterion 3)
- [x] Code block exclusion works (criterion 5)
- [x] URL fragment exclusion works (criterion 6)
- [x] `npm run check && typecheck && test && build` green (criterion 9)
- [x] No console errors during all scenarios

---

## UAT Findings

### UI overflow bug (fixed during UAT)

**Symptom**: Tab bar expanded beyond panel width when many tabs were open, pushing the entire layout to the right and cutting sidebar file names from the left.

**Root cause**: Tab items had `shrink-0` — they never shrank, causing horizontal overflow that propagated up through the layout.

**Fix**: Tabs changed to `flex-1 min-w-0 max-w-[200px]` — they now share available space equally and truncate file names when tight. Also added `overflow-hidden` to parent containers (`App.tsx` body wrapper + both Panels) to prevent any future overflow propagation.

---

## Sign-Off

- [x] **User Approved** — Date: 2026-06-19

---

## Review Log

_Populated by /epic-phase-review._
