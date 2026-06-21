# Phase 03: Sidebar Tags UI

> **Status**: NOT STARTED
> **Dependencies**: Phase 02

---

## Goal

Add a "Tags" section to the sidebar showing all tags with note counts, and wire tag clicks to show filtered search results via the existing SearchPanel.

---

## Tasks

| # | Task | Status | Acceptance Criteria |
|---|------|--------|-------------------|
| 3.1 | Create `src/renderer/stores/tagsStore.ts` — Zustand store for tag list | pending | Holds `TagInfo[]`, exposes `loadTags()`, `notesForTag(tag)` |
| 3.2 | Add "Tags" section to `Sidebar.tsx` below the file tree | pending | Section with header "Tags", lists tags as `name (count)` badges, scrollable |
| 3.3 | Wire tag click → open SearchPanel with pre-populated results | pending | Clicking a tag calls `notesForTag`, opens search panel showing those paths as results |
| 3.4 | Load tags on app startup and after note mutations (save/create/delete/rename) | pending | Tag list refreshes automatically; no manual reload needed |
| 3.5 | Handle empty state and max 50 tags display with "Show all" expansion | pending | Empty: "No tags yet"; >50 tags: shows top 50 by count + expand button |

**Status values**: pending → in_progress → done

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/renderer/stores/tagsStore.ts` | Create | Zustand store for tag data |
| `src/renderer/components/Sidebar.tsx` | Modify | Add Tags section below file tree |
| `src/renderer/stores/searchStore.ts` | Modify | Add `showTagResults(tag, paths[])` action for pre-populated results |
| `src/renderer/components/SearchPanel.tsx` | Modify | Support displaying tag-filtered results (minor: show tag name as query label) |

---

## UI Design

```
┌─────────────────────────┐
│ NOTES          [+][↻][📁]│  ← existing header
├─────────────────────────┤
│ 📁 folder/              │
│   📄 note-a.md          │  ← existing file tree
│   📄 note-b.md          │
│ 📄 standalone.md        │
├─────────────────────────┤
│ TAGS                     │  ← new section header
├─────────────────────────┤
│ javascript (3)           │
│ react (2)                │  ← clickable tag items
│ typescript (2)           │
│ project (1)              │
│                          │
│ ▸ Show all (12 more)     │  ← if >50 tags
└─────────────────────────┘
```

## Tag Click Flow

1. User clicks "javascript (3)" in sidebar
2. `tagsStore.notesForTag('javascript')` → IPC `tags:notesForTag` → `['note-a.md', 'folder/note-b.md', ...]`
3. `searchStore.showTagResults('javascript', paths)` → sets results + opens panel
4. SearchPanel renders results (reuse existing result item component)
5. Input shows `#javascript` as a visual indicator (read-only prefix or placeholder)

---

## Verification

- `npm run typecheck:web` — renderer types clean
- `npm run check` — lint clean
- Visual: sidebar shows tags; clicking one opens search panel with correct results

---

## Notes

- Tags section uses a divider/separator between file tree and tags for visual clarity.
- `tagsStore.loadTags()` is called on mount (App.tsx or Sidebar useEffect) and re-called after successful `writeNote`, `createNote`, `deleteNote`, `renameNote` in vaultStore.
- SearchPanel `showTagResults` is a "synthetic" search — it bypasses the FTS query and directly shows the tag's notes. The query input shows `#tagname` to indicate filter mode.
- If user types in the search input while in tag-filter mode, it switches to normal FTS search (clears the tag filter).

---

## Review Log

_Populated by /epic-phase-review._
