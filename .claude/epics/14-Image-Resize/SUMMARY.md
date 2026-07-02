# Epic 14: Image Resize — Summary

> **Duration**: 2026-07-02 (single day)
> **Phases**: 2 completed (Resize Infrastructure, Polish)
> **Status**: COMPLETE
> **Baseline**: `5610998` (pre-implementation)
> **Implementation**: `9e748af`, UAT fix `3462b1a`

---

## Results

- Drag-to-resize on embedded images: bottom-right handle, pointer capture,
  aspect ratio locked (width-only, height auto).
- Persistence as `<img src alt width />` HTML in markdown — universally
  rendered; natural-size images stay plain `![alt](path)` markdown.
  `serializeImage` is the single source→text function; round-trip tested.
- Constraints: min 80px, max container width, enforced live during drag.
- Single CM transaction per resize (`input.resize-image`) → one Ctrl+Z revert.
- Double-click resets to natural size (converts back to markdown syntax).
- Visual feedback: dashed outline + live W×H badge during drag; hover outline
  + solid accent-dot handle for discoverability (post-UAT).
- 24 unit tests (parse, serialize, escaping, fence/inline-code exclusion,
  mixed markdown+HTML docs). Full suite 256/256 green.

All three VISION.md success criteria verified:

| # | Criterion | Result | Evidence |
|---|-----------|--------|----------|
| 1 | Resize persists after close/reopen | PASS | UAT 2026-07-02; width parsed by `HTML_IMG_RE` on render |
| 2 | Explicit width in markdown source | PASS | `serializeImage` round-trip tests |
| 3 | Ctrl+Z undoes a resize | PASS | single-dispatch transaction; UAT |

---

## Learnings

### What Worked
- Extending `imageWidget.ts` in place (no rewrite) kept the diff small and
  the delete-button/decoration contract intact.
- One serialize function for both formats made the markdown↔HTML conversion
  and dblclick-reset trivially correct.

### What Didn't Work
- Positioning overlay controls on the full-line-width wrapper: after
  shrinking, the handle sat at the editor's right edge with no room to drag
  rightward — growing back was impossible. Caught only in manual UAT.
- Understated handle styling (thin gray corner lines) failed discoverability;
  users couldn't tell images were resizable.

### For Future Epics
- Widget overlay controls must anchor to a shrink-wrapped frame around the
  content, not the block wrapper.
- Drag/pointer interactions cannot be exercised in the Node test env —
  always plan a manual UAT pass for them, and treat affordance/discoverability
  as an explicit acceptance criterion, not polish.

---

## Deferred Items

None. (Two non-blocking parse edge cases involving hand-written `<img>` HTML
— `attrValue` word-boundary, dblclick reset with `]` in alt — were assessed
during phase review as unreachable for feature-written tags; no fix needed.)
