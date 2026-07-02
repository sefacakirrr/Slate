# Epic 14 — Image Resize: Progress

## Status: COMPLETE (code) — reviewed & approved; manual UAT of drag pending

Both phases implemented, audited, and approved on 2026-07-02.
Commit: `9e748af` (implementation).

| # | Task | Status |
|---|------|--------|
| 1 | Parse `<img width>` and render at size | done |
| 2 | Drag handle overlay | done |
| 3 | Drag-to-resize logic | done |
| 4 | CM transaction on drag end | done |
| 5 | Mixed syntax handling | done |
| 6 | Min/max constraints | done |
| 7 | Visual feedback during drag | done |
| 8 | Undo support | done |
| 9 | Double-click reset | done |

## Review Log

### 2026-07-02 — Phase Review (Phases 1–2): APPROVED

**Tasks**: 9/9 genuinely complete (verified against code, not table status)
**Quality**: typecheck PASS (node + web), tests 256/256 PASS, lint has the
same 4 pre-existing Sidebar.tsx a11y errors documented in Epic 13's review —
zero lint issues in `imageWidget.ts`/`imageWidget.test.ts`
**Integration**: connected — `imageWidgetExtension()` registered in
`src/renderer/editor/setup.ts:93`; resize handle + dblclick reset attached in
`ImageWidget.toDOM`; drag end dispatches through `replaceImageSource`
**Commit**: 9e748af

**Evidence highlights**:
- Parse (`imageWidget.ts:98-114`): `HTML_IMG_RE` + `attrValue`; invalid/
  negative/non-numeric width → null (natural size). Fence + inline-code
  exclusion identical to markdown images. Covered by 8 dedicated tests.
- Serialize (`serializeImage`, line 56): single source→text function;
  markdown at natural size, `<img ... width="N" />` when resized; attrs
  escaped, round-trip tested.
- Drag (`createResizeHandle`, line 275): pointer capture, only width set
  (height auto → aspect locked), dashed outline + live W×H badge, clamp
  min 80 / max container on every move AND implicitly at commit (final
  width read from the clamped DOM rect).
- Undo: one dispatch per drag (`userEvent: 'input.resize-image'`) → single
  Ctrl+Z. Structural verification; behavior needs UAT.
- Mixed syntax: endDrag always serializes to `<img>` (converts `![]()` on
  first resize); dblclick reset serializes back to markdown.

**Findings** (non-blocking, hand-written-HTML edge cases):
- `attrValue('src'|'alt')` has no word boundary — a hand-written
  `data-src="x.png"` would be read as `src`. Cannot occur for tags this
  feature writes.
- Dblclick reset emits unescaped markdown `![alt](path)` — a hand-written
  `<img>` with `]` in alt or `)` in path would produce non-parsing markdown.
  Impossible for feature-written tags (alt originates from `[^\]]*`).
- If the image fails to load (onerror placeholder), the resize handle still
  exists; dragging a 0-width hidden img would write `width="80"`. Cosmetic.

**UAT ADVISORY** — drag interaction is not exercisable in the Node test
environment (pointer capture, CM widget DOM). Before calling the epic done,
manually verify in `npm run dev`:
- Drag bottom-right handle: aspect stays locked, badge shows W×H, dashed
  outline appears, min 80px / max container respected.
- Release: source line becomes `<img src=... width="N" />`; close/reopen
  note → size persists.
- Single Ctrl+Z reverts the whole resize.
- Double-click a resized image → back to `![alt](path)` at natural size.

## Notes

- All in `src/renderer/editor/imageWidget.ts`; 24 new/updated unit tests in
  `imageWidget.test.ts`.
- Persistence format decision held: `<img>` HTML in markdown, width-only
  (no height attr), universally rendered.
