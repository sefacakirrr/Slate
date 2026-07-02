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

/** In-app update states (Epic 12), pushed from main via the `update:state` event. */
export type UpdateStatus =
  | 'dev-disabled'
  | 'checking'
  | 'up-to-date'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'error'

export type UpdateState = {
  status: UpdateStatus
  /** The latest available version (on `available`/`downloaded`). */
  version?: string
  /** Download progress 0–100 (Windows, on `downloading`). */
  percent?: number
  /** GitHub Releases URL to open (macOS, on `available`). */
  url?: string
  /** Human-readable error (on `error`). */
  error?: string
}

/** Import wizard (Epic 15): what a scan of the chosen source found. */
export type ImportScanInfo = {
  kind: 'folder' | 'notion-zip'
  sourceName: string
  counts: { md: number; txt: number; html: number }
  total: number
}

/** Import progress, pushed from main via the `import:progress` event. */
export type ImportProgressInfo = {
  done: number
  total: number
  currentFile: string
}

/** The outcome of an executed import. */
export type ImportResultInfo = {
  imported: number
  skipped: number
  targetFolder: string
}
