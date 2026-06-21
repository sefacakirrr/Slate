# Phase 02: Paste & Drop Extension

> **Status**: NOT STARTED
> **Dependencies**: Phase 01

---

## Goal

Create a CM6 extension that intercepts paste and drop events, stores attachments via IPC, and inserts the appropriate markdown link at the cursor.

---

## Tasks

| # | Task | Status | Acceptance Criteria |
|---|------|--------|-------------------|
| 2.1 | Create `attachmentExtension()` factory in `src/renderer/editor/` | pending | Returns CM6 `Extension` using `EditorView.domEventHandlers()` |
| 2.2 | Handle `paste` event — extract files from `clipboardData` | pending | Image paste detected, other paste (text) falls through to default |
| 2.3 | Handle `drop` event — extract files from `dataTransfer` | pending | Any dropped file detected, non-file drops fall through |
| 2.4 | File → base64 conversion in renderer | pending | `FileReader.readAsArrayBuffer()` → base64 string |
| 2.5 | Call `window.api.attachment.store()` and insert markdown link on success | pending | Image: `![filename](_attachments/hash.ext)`, other: `[filename](_attachments/hash.ext)` |
| 2.6 | Add extension to `createTabState()` in setup.ts | pending | Extension active in all editor tabs |

**Status values**: pending → in_progress → done

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/renderer/editor/attachments.ts` | Create | `attachmentExtension()` — paste/drop handler + insert logic |
| `src/renderer/editor/setup.ts` | Modify | Add `attachmentExtension()` to extension array |

---

## Verification

- `npm run typecheck:web` — no errors
- `npm run check` — Biome clean
- Manual: paste screenshot → `_attachments/` gets file, editor shows markdown link
- Manual: drop a .pdf → `_attachments/` gets file, editor shows `[file.pdf](...)` link

---

## Notes

- `event.preventDefault()` must be called only when we handle the event (file detected). Text paste/drop must not be intercepted.
- Image detection: check `file.type.startsWith('image/')` for inline render syntax
- For clipboard paste without filename (screenshots): generate name like `paste-<timestamp>.png`
- Size validation: check `file.size > 10 * 1024 * 1024` before reading — show console warning or future toast
- Multiple files in single drop: process sequentially, insert links separated by newlines

---

## Review Log

_Populated by /epic-phase-review._
