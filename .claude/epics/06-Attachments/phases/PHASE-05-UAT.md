# Phase 05: User Acceptance Testing

> **Status**: NOT STARTED
> **Dependencies**: All implementation phases
> **Note**: Only the user can mark this phase complete.

---

## Goal

User verifies the attachment feature works end-to-end in the running app.

---

## Test Scenarios

| # | Scenario | Expected Result | Status |
|---|----------|-----------------|--------|
| 1 | Paste a screenshot from clipboard (Ctrl+V) | Image stored in `_attachments/`, markdown image link inserted, image renders inline | pending |
| 2 | Drop an image file onto the editor | Same as paste — stored, linked, rendered inline | pending |
| 3 | Drop a non-image file (.pdf, .zip) onto the editor | File stored in `_attachments/`, `[filename](path)` link inserted (no inline render) | pending |
| 4 | Paste same screenshot twice | Only one file in `_attachments/` (dedup by hash), two links point to same file | pending |
| 5 | Paste a file larger than 10MB | Rejected with user feedback, nothing inserted | pending |
| 6 | Delete attachment file from disk, reopen note | Broken image placeholder shows (no crash, no blank space) | pending |
| 7 | Image in a fenced code block `![](path)` | NOT rendered inline — treated as code | pending |
| 8 | Multiple images in one note — scroll performance | Smooth scroll, no jank, images load lazily | pending |

---

## Acceptance Checklist

From VISION.md Section 4 — Success Criteria:

- [ ] Paste screenshot → stored + linked + rendered (criteria 1, 2, 3)
- [ ] Drop any file → stored + linked (criterion 4)
- [ ] Dedup works (criterion 5)
- [ ] Size limit enforced (criterion 6)
- [ ] Broken image handled gracefully (criterion 9)
- [ ] `npm run check && typecheck && test && build` green (criterion 8)
- [ ] No console errors during all scenarios

---

## Sign-Off

- [ ] **User Approved** — Date: ___

---

## Review Log

_Populated by /epic-phase-review._
