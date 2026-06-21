# Phase 03: Image Widget Decoration

> **Status**: NOT STARTED
> **Dependencies**: Phase 02

---

## Goal

Render inline images in the editor via CM6 ViewPlugin and Decoration.widget — images display below their markdown syntax line.

---

## Tasks

| # | Task | Status | Acceptance Criteria |
|---|------|--------|-------------------|
| 3.1 | Create `imageWidgetExtension()` ViewPlugin in `src/renderer/editor/` | pending | Plugin registered, rebuilds decorations on doc change |
| 3.2 | Implement regex scanner for `![alt](path)` patterns in document | pending | Correctly identifies image links, ignores non-image and fenced code blocks |
| 3.3 | Create `ImageWidget` class extending `WidgetType` | pending | Renders `<img>` element with correct src (resolved path) |
| 3.4 | Resolve vault-relative attachment path to loadable URL | pending | Uses `file://` protocol or Electron custom protocol to load from disk |
| 3.5 | Implement lazy loading — only render images in/near viewport | pending | Off-screen images use placeholder; load on scroll into view |
| 3.6 | Handle broken images — show placeholder when file is missing | pending | Missing file shows styled "image not found" placeholder, no crash |

**Status values**: pending → in_progress → done

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/renderer/editor/imageWidget.ts` | Create | ViewPlugin + ImageWidget class + path resolution |
| `src/renderer/editor/setup.ts` | Modify | Add `imageWidgetExtension()` to extension array |
| `src/main/index.ts` | Modify (possibly) | Register `file://` protocol or custom protocol for local images |

---

## Verification

- `npm run typecheck:web` — no errors
- `npm run check` — Biome clean
- Manual: paste image → image renders inline below the markdown syntax
- Manual: delete image file from disk → placeholder shows instead of broken image
- Manual: scroll through 20+ images — no jank, smooth performance

---

## Notes

- **Decoration placement**: `Decoration.widget({ widget, block: true })` placed after the line containing `![](...)`. This renders the image below the markdown text — user still sees and can edit the link syntax.
- **Path resolution**: Vault path is needed to construct the full file path. Options:
  1. Expose vault path to renderer via IPC (already available as `settings:getVaultPath`)
  2. Use a custom Electron protocol (e.g., `slate-file://`) that resolves vault-relative paths
  Option 1 is simpler for v1.
- **Image dimensions**: Cap max width at 100% of editor width. Height auto. No resize handles (out of scope).
- **Code block exclusion**: Don't render images for `![](...)` inside fenced code blocks. Reuse the same exclusion logic pattern as tag extraction.
- **Performance**: ViewPlugin only scans visible range + buffer. `IntersectionObserver` on rendered `<img>` elements triggers actual image load.

---

## Review Log

_Populated by /epic-phase-review._
