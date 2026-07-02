# Epic 14 — Image Resize: Progress

## Status: IMPLEMENTED (both phases) — awaiting /epic-phase-review + manual UAT

## Current phase: Phase 2 — Polish (complete)

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

## Notes

- All in `src/renderer/editor/imageWidget.ts`:
  - `HTML_IMG_RE` + `attrValue` parse `<img src alt width>`; invalid/negative
    width → natural size. Code fences/inline code excluded like markdown images.
  - `serializeImage(path, alt, width)` is the single source→text function:
    markdown `![]()` at natural size, `<img ... width="N" />` when resized.
    Double-click reset therefore converts back to markdown.
  - `createResizeHandle`: bottom-right corner handle, pointer capture, only
    width is set (height auto → aspect ratio locked). Dashed accent outline +
    live "W × H" badge during drag.
  - `clampWidth`: min 80px (`MIN_IMAGE_WIDTH`), max container width.
  - Drag end dispatches ONE transaction (`userEvent: 'input.resize-image'`) →
    single Ctrl+Z reverts. Stale-range guard in `replaceImageSource`.
- 24 unit tests in `imageWidget.test.ts` (serialize round-trip, attr escaping,
  invalid widths, fence/inline-code exclusion, mixed markdown+HTML docs).
- **Drag interaction needs manual UAT** — pointer capture and CM widget DOM
  can't be exercised in the Node test environment.
