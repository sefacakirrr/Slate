import Database from 'better-sqlite3'
import { isEncryptedPath } from './EncryptionService'
import { extractTags } from './extractTags'

/** A single indexed note's identity + freshness, used by reconciliation. */
export type IndexedNote = {
  path: string
  mtime: number
}

/** Content + freshness for one note, fed into a full {@link IndexService.rebuild}. */
export type NoteEntry = {
  path: string
  content: string
  mtime: number
}

/** A tag with its associated note count, returned by {@link IndexService.listTags}. */
export type TagInfo = {
  name: string
  count: number
}

/**
 * Owns the SQLite FTS5 search index — a derived, rebuildable artifact that lives
 * in `userData`, never in the vault. Pure of Electron and the filesystem: it is
 * handed note `content`/`mtime` and never reads disk itself, which keeps it
 * unit-testable (pass a temp file or `:memory:` to the constructor) and confines
 * all file IO to the Phase-02 reconciliation coordinator.
 *
 * Schema is external-content FTS5: a `notes` table holds the authoritative rows
 * (path + mtime + content) and `notes_fts` mirrors `content` for matching, kept
 * in sync by triggers — so every mutation goes through plain SQL on `notes` and
 * the FTS index follows automatically.
 */
export class IndexService {
  private readonly db: Database.Database

  constructor(dbPath: string) {
    this.db = new Database(dbPath)
    // WAL + NORMAL: the index is rebuildable, so we trade a sliver of crash
    // durability for faster writes during indexing/reconciliation.
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('synchronous = NORMAL')
    this.bootstrap()
  }

  /** Creates the schema + sync triggers if absent. Idempotent. */
  private bootstrap(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS notes (
        id      INTEGER PRIMARY KEY,
        path    TEXT UNIQUE NOT NULL,
        mtime   INTEGER NOT NULL,
        content TEXT NOT NULL
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
        content,
        content='notes',
        content_rowid='id'
      );

      -- Keep notes_fts in lockstep with notes (external-content bookkeeping).
      CREATE TRIGGER IF NOT EXISTS notes_ai AFTER INSERT ON notes BEGIN
        INSERT INTO notes_fts(rowid, content) VALUES (new.id, new.content);
      END;
      CREATE TRIGGER IF NOT EXISTS notes_ad AFTER DELETE ON notes BEGIN
        INSERT INTO notes_fts(notes_fts, rowid, content) VALUES ('delete', old.id, old.content);
      END;
      CREATE TRIGGER IF NOT EXISTS notes_au AFTER UPDATE ON notes BEGIN
        INSERT INTO notes_fts(notes_fts, rowid, content) VALUES ('delete', old.id, old.content);
        INSERT INTO notes_fts(rowid, content) VALUES (new.id, new.content);
      END;

      -- Tags: normalized tag names + junction table for note↔tag associations.
      CREATE TABLE IF NOT EXISTS tags (
        id   INTEGER PRIMARY KEY,
        name TEXT UNIQUE NOT NULL
      );

      CREATE TABLE IF NOT EXISTS note_tags (
        note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
        tag_id  INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
        PRIMARY KEY (note_id, tag_id)
      );

      CREATE INDEX IF NOT EXISTS idx_note_tags_tag ON note_tags(tag_id);
    `)
    this.db.pragma('foreign_keys = ON')
  }

  /**
   * Inserts or updates a note by path. A re-indexed path updates its content +
   * mtime in place (no duplicate row); the triggers refresh `notes_fts`.
   * Also syncs the note's tag associations from its content.
   */
  indexNote(path: string, content: string, mtime: number): void {
    // Security boundary: a locked note's content must never enter the index.
    // Enforced here at the index layer so no caller can leak it by forgetting to
    // filter (defense in depth on top of the lock/reconcile/rebuild guards).
    if (isEncryptedPath(path)) return
    this.db
      .prepare(
        `INSERT INTO notes (path, mtime, content) VALUES (?, ?, ?)
         ON CONFLICT(path) DO UPDATE SET mtime = excluded.mtime, content = excluded.content`,
      )
      .run(path, mtime, content)
    this.syncTags(path, extractTags(content))
  }

  /** Removes a note by path. A path that isn't indexed is a no-op. */
  removeNote(path: string): void {
    this.db.prepare('DELETE FROM notes WHERE path = ?').run(path)
  }

  /**
   * Re-points a note from one path to another, preserving its indexed content.
   * No-op if `from` isn't indexed. Throws if `to` is already taken (the caller —
   * VaultService — guards against overwrite before the file rename).
   */
  renameNote(from: string, to: string): void {
    this.db.prepare('UPDATE notes SET path = ? WHERE path = ?').run(to, from)
  }

  /**
   * Clears the index and re-indexes the provided set wholesale, in a single
   * transaction. Used for the manual rebuild and as the cold-start path.
   * Also rebuilds all tag associations from content.
   */
  rebuild(entries: NoteEntry[]): void {
    // Never index locked notes, even if a caller hands them in (see indexNote).
    const safe = entries.filter((e) => !isEncryptedPath(e.path))
    const insert = this.db.prepare('INSERT INTO notes (path, mtime, content) VALUES (?, ?, ?)')
    const replaceAll = this.db.transaction((rows: NoteEntry[]) => {
      this.db.exec('DELETE FROM notes')
      this.db.exec('DELETE FROM note_tags')
      this.db.exec('DELETE FROM tags')
      for (const r of rows) insert.run(r.path, r.mtime, r.content)
    })
    replaceAll(safe)
    for (const r of safe) {
      this.syncTags(r.path, extractTags(r.content))
    }
  }

  /** Every indexed note's path + mtime — the left side of reconciliation. */
  getIndexed(): IndexedNote[] {
    return this.db.prepare('SELECT path, mtime FROM notes').all() as IndexedNote[]
  }

  /**
   * Diff-based tag sync for a single note. Compares the note's current DB tags
   * against the provided set and applies only the delta (insert new, remove stale).
   */
  syncTags(path: string, newTags: string[]): void {
    const row = this.db.prepare('SELECT id FROM notes WHERE path = ?').get(path) as
      | { id: number }
      | undefined
    if (!row) return

    const noteId = row.id
    const current = (
      this.db
        .prepare(
          `SELECT t.name FROM tags t JOIN note_tags nt ON nt.tag_id = t.id WHERE nt.note_id = ?`,
        )
        .all(noteId) as { name: string }[]
    ).map((r) => r.name)

    const currentSet = new Set(current)
    const newSet = new Set(newTags)

    const toAdd = newTags.filter((t) => !currentSet.has(t))
    const toRemove = current.filter((t) => !newSet.has(t))

    const insertTag = this.db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)')
    const getTagId = this.db.prepare('SELECT id FROM tags WHERE name = ?')
    const insertLink = this.db.prepare(
      'INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?, ?)',
    )

    for (const tag of toAdd) {
      insertTag.run(tag)
      const tagRow = getTagId.get(tag) as { id: number }
      insertLink.run(noteId, tagRow.id)
    }

    if (toRemove.length > 0) {
      const removeLink = this.db.prepare(
        'DELETE FROM note_tags WHERE note_id = ? AND tag_id = (SELECT id FROM tags WHERE name = ?)',
      )
      for (const tag of toRemove) {
        removeLink.run(noteId, tag)
      }
    }
  }

  /** All tags with their note count, ordered by count DESC then name ASC. */
  listTags(): TagInfo[] {
    return this.db
      .prepare(
        `SELECT t.name, COUNT(nt.note_id) AS count
         FROM tags t
         JOIN note_tags nt ON nt.tag_id = t.id
         GROUP BY t.id
         ORDER BY count DESC, t.name ASC`,
      )
      .all() as TagInfo[]
  }

  /** Note paths associated with a given tag name. */
  notesForTag(tag: string): string[] {
    const rows = this.db
      .prepare(
        `SELECT n.path FROM notes n
         JOIN note_tags nt ON nt.note_id = n.id
         JOIN tags t ON t.id = nt.tag_id
         WHERE t.name = ?
         ORDER BY n.path`,
      )
      .all(tag.toLowerCase()) as { path: string }[]
    return rows.map((r) => r.path)
  }

  /**
   * The underlying connection, for {@link SearchService} to issue read-only
   * `MATCH` queries against the same index. The index owns the connection's
   * lifecycle ({@link close}).
   */
  get connection(): Database.Database {
    return this.db
  }

  /** Closes the database connection. */
  close(): void {
    this.db.close()
  }
}
