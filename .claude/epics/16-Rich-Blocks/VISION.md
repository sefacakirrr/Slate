# Epic 16 — Rich Blocks (Todo, Radio, Toggle)

## Problem

Slate currently supports basic checkboxes (`- [ ]` / `- [x]`) via `checkboxWidget.ts`. But Apple Notes and Notion offer richer block types: ordered checklists, radio buttons (single-select), toggle/collapse sections, callout blocks, etc. Users switching from those apps expect this level of interactivity.

## Solution

Extend the CodeMirror widget system to support additional interactive block types, all backed by standard or de-facto markdown syntax so notes remain portable.

### Block types (Phase 1)

| Block | Markdown syntax | Behavior |
|-------|----------------|----------|
| Todo (existing) | `- [ ]` / `- [x]` | Click toggles done. Already shipped. |
| Ordered todo | `1. [ ]` / `1. [x]` | Numbered checklist — same toggle, ordered rendering. |
| Radio group | `- ( )` / `- (x)` | Click selects one, deselects siblings in the same list. |
| Toggle/collapse | `<details><summary>Title</summary>\ncontent\n</details>` | Collapsible section. Standard HTML in markdown. |
| Callout/admonition | `> [!note]` / `> [!warning]` | Styled blockquote (GitHub-flavored admonitions). |

### Architecture

Each block type is a CodeMirror `WidgetType` + `ViewPlugin` pair:
- Widget renders the interactive element (checkbox, radio dot, collapse arrow).
- Plugin detects the syntax pattern via `syntaxTree` or regex on the line, replaces the marker range with the widget.
- Click handler dispatches a transaction that mutates the underlying markdown text.

### Phase 2 (future)

- Drag-to-reorder within a list.
- Slash command menu (`/todo`, `/toggle`, `/callout`) to insert blocks.
- Keyboard shortcuts for block insertion.

## Scope (Phase 1)

- Ordered todo widget.
- Radio group widget (single-select within contiguous list).
- Toggle/collapse widget (details/summary).
- Callout/admonition styling.
- All backed by markdown source — no proprietary format.

## Non-goals

- Database/table blocks (Notion-style).
- Kanban boards.
- Embedded code execution.

## Success criteria

- User types `- ( ) Option A` and sees a radio button; clicking it deselects siblings.
- Toggle blocks collapse/expand on click; collapsed state is visual only (markdown unchanged).
- All block types survive a round-trip: close note → reopen → same rendered state.
- Raw `.md` file opened in VS Code/GitHub renders acceptably (graceful degradation).
