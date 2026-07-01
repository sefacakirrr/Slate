# Epic 16 — Rich Blocks: Planning

## Phases

### Phase 1: Ordered Todo + Radio

| # | Task | File(s) | Estimate |
|---|------|---------|----------|
| 1 | Refactor `checkboxWidget.ts` into a shared block-widget base (pattern detect → widget render → click → transaction) | `src/renderer/editor/blockWidgetBase.ts` | 45 min |
| 2 | Ordered todo widget: `1. [ ]` / `1. [x]` — numbered checklist with toggle | `src/renderer/editor/orderedTodoWidget.ts` | 30 min |
| 3 | Radio widget: `- ( )` / `- (x)` — click selects one, deselects siblings in contiguous block | `src/renderer/editor/radioWidget.ts` | 60 min |
| 4 | Register new widgets in editor setup | `src/renderer/editor/setup.ts` | 10 min |

### Phase 2: Toggle & Callout

| # | Task | File(s) | Estimate |
|---|------|---------|----------|
| 5 | Toggle/collapse widget: `<details><summary>` → collapse arrow, click toggles visibility | `src/renderer/editor/toggleWidget.ts` | 60 min |
| 6 | Callout/admonition styling: `> [!note]`, `> [!warning]`, `> [!tip]` → colored blockquote with icon | `src/renderer/editor/calloutWidget.ts` | 45 min |
| 7 | CSS for callout variants (note=blue, warning=yellow, tip=green) | `src/renderer/editor/` or tailwind utilities | 20 min |

### Phase 3: Tests & Integration

| # | Task | File(s) | Estimate |
|---|------|---------|----------|
| 8 | Unit tests: ordered todo toggle | `src/renderer/editor/orderedTodoWidget.test.ts` | 20 min |
| 9 | Unit tests: radio single-select behavior | `src/renderer/editor/radioWidget.test.ts` | 30 min |
| 10 | Unit tests: toggle collapse state | `src/renderer/editor/toggleWidget.test.ts` | 20 min |
| 11 | Ensure graceful degradation: raw markdown readable in VS Code / GitHub | Manual check + document in notes | 10 min |

## Key decisions

- **Markdown-native**: all block types use syntax that other renderers handle (or degrade gracefully).
- **Radio syntax `- ( )` / `- (x)`**: not standard, but readable in plain text and unambiguous. Renders as a bullet list in other editors — acceptable degradation.
- **Collapse state is ephemeral**: toggling a `<details>` doesn't change the markdown (it's always "open" in source). Collapsed state resets on reopen — simple, no hidden state.
- **Sibling detection for radio**: contiguous `- ( )` lines form a group. A blank line breaks the group.

## Dependencies

- Existing `checkboxWidget.ts` as reference/base.
- CodeMirror `WidgetType`, `ViewPlugin`, `Decoration`.

## Risk

- Medium. Radio group sibling detection across CM lines requires careful range math. Toggle widget needs to hide/show multi-line content which is more complex than single-line decorations. Callouts are the simplest (pure styling).
