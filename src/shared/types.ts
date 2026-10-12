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

/** UI language. English is the source dictionary; Turkish mirrors it. */
export type Language = 'en' | 'tr'

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
  /** Plain-text release-notes summary (on `available`/`downloaded`). */
  notes?: string
}

/** Import wizard (Epic 15): what a scan of the chosen source found. */
export type ImportScanInfo = {
  kind: 'folder' | 'notion-zip'
  sourceName: string
  /** `text` = generic plain-text files (code, configs, extension-less notes). */
  counts: { md: number; txt: number; html: number; rtf: number; text: number }
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

/** Recurrence pattern for a reminder. */
export type ReminderRecurrence = 'none' | 'daily' | 'weekly' | 'monthly'

/** A persisted reminder record (Epic 16 — Calendar & Reminders). */
export type ReminderRecord = {
  id: string
  title: string
  /** Vault-relative note path this reminder is linked to, or null. */
  notePath: string | null
  /** ISO-8601 datetime string for the reminder's target time. */
  fireAt: string
  /** How many minutes before `fireAt` to actually fire (0 = at exact time). */
  alertBefore: number
  /** Repeat pattern: 'none' = one-shot. */
  recurrence: ReminderRecurrence
  /**
   * Monthly only: the day-of-month (1–31, local) the reminder recurs on, kept
   * once fireAt has been clamped to a shorter month (Jan 31 → Feb 28 → Mar 31).
   * Absent → the day of `fireAt`.
   */
  anchorDay?: number
  fired: boolean
  createdAt: number
}

/** Payload pushed from main → renderer when a reminder fires. */
export type ReminderFiredPayload = {
  id: string
  title: string
  notePath: string | null
}

/** A note or folder sitting in the in-vault trash (`<vault>/.trash/<id>/`). */
export type TrashItem = {
  id: string
  kind: 'note' | 'folder'
  /** Display name: the last segment of `originalPath`. */
  name: string
  /** Vault-relative path (forward slashes) the item was deleted from. */
  originalPath: string
  /** ISO-8601 timestamp of the delete. */
  deletedAt: string
  /**
   * True when the original also went to the OS recycle bin (Windows Recycle
   * Bin / macOS Trash); the `.trash` entry is then a copy. Absent when the OS
   * trash failed and the original was moved into `.trash` instead.
   */
  osTrashed?: boolean
}

/**
 * A file the user asked to open from outside the app (dropped from the file
 * manager, "Open with", double-click, macOS open-file), resolved by main:
 * - `vault`: the file lives inside the current vault → opened as a normal
 *   note tab by its vault-relative path (forward slashes).
 * - `external`: anywhere else → opened as an external tab keyed by its
 *   absolute path; main has added it to the read/write allowlist.
 * - `error`: rejected (missing, too large, binary, not UTF-8, wrong type).
 */
export type OpenFileRequest =
  | { kind: 'vault'; path: string }
  | { kind: 'external'; path: string }
  | { kind: 'error'; path: string; error: string }
