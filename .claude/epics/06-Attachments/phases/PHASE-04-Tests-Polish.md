# Phase 04: Tests & Polish

> **Status**: NOT STARTED
> **Dependencies**: Phase 03

---

## Goal

Comprehensive test coverage for the attachment pipeline + edge case handling and error UX.

---

## Tasks

| # | Task | Status | Acceptance Criteria |
|---|------|--------|-------------------|
| 4.1 | AttachmentService unit tests — hash correctness, dedup, size reject, ext extraction | pending | All cases pass, coverage of happy + error paths |
| 4.2 | IPC handler integration test — base64 round-trip | pending | Encode → decode → store → correct file on disk |
| 4.3 | Attachment extension unit test — file type detection, link format | pending | Image → `![](...)`, non-image → `[](...)`, size check |
| 4.4 | Image widget test — regex pattern matching, code block exclusion | pending | Correct positions identified, fenced blocks skipped |
| 4.5 | Error handling polish — user-facing feedback for size limit, no vault, write failure | pending | Errors surface as console.warn (or toast if added); no silent failures |

**Status values**: pending → in_progress → done

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/main/services/AttachmentService.test.ts` | Modify | Expand tests from Phase 00 |
| `src/renderer/editor/attachments.test.ts` | Create | Extension logic tests |
| `src/renderer/editor/imageWidget.test.ts` | Create | Widget regex + exclusion tests |

---

## Verification

- `npm run test` — all tests pass
- `npm run typecheck` — both projects clean
- `npm run check` — Biome clean
- `npm run build` — production build succeeds

---

## Notes

- Tests run under `ELECTRON_RUN_AS_NODE=1` (required for better-sqlite3 ABI)
- CM6 widget tests are tricky — test the regex/scanner logic as pure functions, not the DOM rendering
- Error handling: for v1, `console.warn` is acceptable. Toast notification system is a future epic.

---

## Review Log

_Populated by /epic-phase-review._
