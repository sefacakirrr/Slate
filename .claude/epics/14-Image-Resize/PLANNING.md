# Epic 14 — Image Resize: Planning

## Phases

### Phase 1: Resize Infrastructure

| # | Task | File(s) | Estimate |
|---|------|---------|----------|
| 1 | Parse existing `<img width="N">` in markdown and render at that width | `src/renderer/editor/imageWidget.ts` | 30 min |
| 2 | Add drag handle overlay (bottom-right corner) to image widget | `src/renderer/editor/imageWidget.ts` | 45 min |
| 3 | Implement drag-to-resize logic (pointer events, aspect ratio lock) | `src/renderer/editor/imageWidget.ts` | 45 min |
| 4 | On drag end: dispatch CM transaction replacing `![...](...) ` with `<img src="..." width="N" />` | `src/renderer/editor/imageWidget.ts` | 30 min |
| 5 | Handle mixed syntax: if source is `![]()` and user resizes, convert to `<img>` tag | `src/renderer/editor/imageWidget.ts` | 20 min |

### Phase 2: Polish

| # | Task | File(s) | Estimate |
|---|------|---------|----------|
| 6 | Min (80px) / max (container width) constraints | `src/renderer/editor/imageWidget.ts` | 15 min |
| 7 | Visual feedback: dashed border + dimension tooltip during drag | `src/renderer/editor/imageWidget.ts` | 20 min |
| 8 | Undo support: single transaction so Ctrl+Z reverts the resize | (should be free via CM transaction) | 10 min |
| 9 | Double-click to reset to natural size (remove width attr) | `src/renderer/editor/imageWidget.ts` | 15 min |

## Key decisions

- **Persistence format**: `<img src="..." alt="..." width="N" />` — HTML in markdown, universally rendered.
- **Aspect ratio**: always locked. Height is implicit (auto).
- **No height attribute**: only width is stored — simpler, responsive-friendly.

## Dependencies

- Existing `imageWidget.ts` — extending, not rewriting.

## Risk

- Medium-low. The CM decoration/widget system supports this pattern (Obsidian does the same). Main complexity is coordinating the DOM drag with CM transactions.
