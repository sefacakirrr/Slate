# Phase 03: Search UI

> **Status**: NOT STARTED
> **Dependencies**: Phase 02

---

## Goal

A `Ctrl+Shift+F` search panel: type a query, see ranked results with snippets, click one to open it in a tab via the E3 workspace.

---

## Tasks

| # | Task | Status | Acceptance Criteria |
|---|------|--------|---------------------|
| 3.1 | `SearchPanel` component — query input + results list (path/title + snippet per row) | done | Typing a query renders ranked results with snippets |
| 3.2 | Wire query → `api.search.query`, debounced; render `{path, snippet, rank}` rows; snippet highlight delimiters styled | done | Results update as the user types; no query-per-keystroke storm (debounced) |
| 3.3 | `Ctrl+Shift+F` toggles the panel open/focused (via `react-hotkeys-hook`); `Esc` closes | done | Hotkey opens + focuses the input; Esc dismisses |
| 3.4 | Click a result → `workspaceStore.openTab(path)` and close/keep panel per chosen UX | done | Clicking opens the note as the active tab (existing tab focused, not duplicated) |
| 3.5 | Empty-query and no-results states | done | Empty query shows a hint, not an error; a query with no hits shows "no results" |
| 3.6 | Mount `SearchPanel` in the app shell (overlay/panel) without disturbing the E3 tab/editor layout | done | Panel coexists with sidebar + tabs; no layout regression |

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/renderer/components/SearchPanel.tsx` | Create | The search surface |
| `src/renderer/stores/searchStore.ts` | Create (optional) | Query/results/open state if local state is insufficient |
| `src/renderer/App.tsx` | Modify | Mount the panel + hotkey scope |
| `src/renderer/index.css` | Modify | Snippet highlight + panel styling if needed |

---

## Verification

`npm run check`, `npm run typecheck`, `npm run test`, `npm run build` green; `npm run dev` shows no console errors opening/using/closing the panel.

- `Ctrl+Shift+F` opens and focuses the input.
- Typing returns ranked results with visible snippets.
- Clicking a result opens that note as the active tab (focuses an already-open tab rather than duplicating).
- No-results and empty states render cleanly; `Esc` closes.

---

## Notes

- **Integration with E3**: results open through `workspaceStore.openTab` — which already adds-or-focuses and activates. No new tab logic needed.
- Debounce the query (~150–250ms) so typing doesn't fire an IPC per keystroke; cancel/ignore stale responses (last-write-wins on the input).
- The CM6 editor already binds keys; keep the `Ctrl+Shift+F` scope at the app level so it works regardless of editor focus. Watch for conflicts with any existing keymap.
- Result "title" = derive from path (filename without extension) for v1; no first-line/heading extraction (that's a later refinement).
- Renderer-store logic (if a `searchStore` is added) is unit-testable by mocking `@renderer/api` — but the panel itself is UAT-covered (no DOM tests), mirroring the E3 approach.

---

## Review Log

### 2026-06-15 — Phase Review: APPROVED

**Tasks**: 6/6 genuinely complete, 0 stubs, 0 partial
**Quality**: PASS (110 tests incl. +13 this phase; typecheck node+web 0 errors; build green; biome clean; no TODO/stub)
**Integration**: full UI path closed — hotkey (App.tsx:33) → SearchPanel (mounted :55) → `api.search.query` (P02) → SearchService (P01) → index (P00) → `openTab` (E3).
**Plan integrity**: OK — snippet-marker coupling carried since P01 is now resolved renderer-side.
**Commit**: uncommitted (project directive, consistent with E1–E3).

**Findings (non-blocking)**:
- Snippet markers resolved via a renderer-local `searchHighlight.ts` (`String.fromCharCode(0xe000/0xe001)` mirroring SearchService) → `splitSnippet` returns `{text, highlight}[]`, rendered as `<mark>` spans, never `dangerouslySetInnerHTML`. 6 unit tests (no/one/many markers, adjacent, unbalanced, empty).
- `searchStore` carries a `seq` stale-response guard so a slow earlier query can't overwrite a newer one's results; empty/whitespace short-circuits without IPC. 7 unit tests.
- **Esc scope is input-focused only** (onKeyDown on the input); tabbing focus to a result button means Esc won't close, though the backdrop click still does. Input is focused on open so the common path works. Minor inconsistency vs ConfirmDialog's window-level Esc.
- **SearchPanel.tsx has no DOM test** — hotkey-opens-and-focuses, debounce timing, and click→openTab are UAT-only, consistent with the E2/E3 panel convention. Testable logic (store + highlight) is unit-covered.
- `openResult` closes the panel without awaiting `openTab` — a result for a note deleted since indexing closes the panel and opens nothing (logged). Acceptable.

**Deferred**: none.
