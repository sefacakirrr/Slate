// Domain types shared between main and renderer processes.

/**
 * One ranked search hit. Crosses the IPC boundary (the `search:query` channel,
 * wired in E4 Phase 02). `snippet` carries the matched window with the matched
 * term wrapped in sentinel characters (see `SearchService` `SNIPPET_MARK_OPEN`/
 * `SNIPPET_MARK_CLOSE`) for the renderer to split and highlight; `rank` is FTS5's
 * bm25 score (more negative = better match), exposed for debugging/tie-breaking.
 */
export type SearchResult = {
  path: string
  snippet: string
  rank: number
}

/** A tag with its associated note count, used by the sidebar tags section. */
export type TagInfo = {
  name: string
  count: number
}

export type ThemeMode = 'dark' | 'light' | 'system'

export type NoteListItem = {
  path: string
  title: string
  snippet: string
  mtime: number
}
