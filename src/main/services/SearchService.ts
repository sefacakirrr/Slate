import type { SearchResult } from '@shared/types'
import type Database from 'better-sqlite3'

/**
 * Sentinel characters that wrap the matched terms inside a result `snippet`.
 * Private-use-area code points — they never occur in real note content, so the
 * renderer (E4 Phase 03) can split on them to highlight matches without risking
 * a collision with markdown punctuation like `[` `]` `*` `<`.
 */
export const SNIPPET_MARK_OPEN = ''
export const SNIPPET_MARK_CLOSE = ''

/** Default result cap — bounds rendering in the Phase 03 panel. */
const DEFAULT_LIMIT = 50

/** How many tokens of context FTS5 packs into each snippet window. */
const SNIPPET_TOKENS = 12

/**
 * Read-only ranked search over the FTS5 index built by {@link IndexService}.
 * Shares the same `better-sqlite3` connection but never writes to it and never
 * owns its lifecycle — `IndexService` opens and closes the db. Pure of Electron
 * and the filesystem, so it is unit-testable against a temp-db index.
 *
 * **Query handling.** Raw user input is never passed to FTS5 verbatim — a bare
 * `"`, `*`, or `(` would raise an FTS5 syntax error. {@link toMatchQuery}
 * rewrites the input into a safe query: each whitespace-separated token is
 * matched as a literal term (implicit AND between them), and the final token is
 * a prefix term so a query matches as the user types. Empty, whitespace-only, or
 * punctuation-only input yields no query and an empty result — never a throw.
 */
export class SearchService {
  private readonly db: Database.Database

  constructor(db: Database.Database) {
    this.db = db
  }

  /**
   * Ranked matches for `query`, best-first, capped at `limit`. Returns `[]` for
   * input that has no searchable token. Never throws on malformed query text.
   */
  search(query: string, limit: number = DEFAULT_LIMIT): SearchResult[] {
    const match = SearchService.toMatchQuery(query)
    if (match === null) return []

    return this.db
      .prepare(
        `SELECT n.path AS path,
                snippet(notes_fts, 0, ?, ?, '…', ?) AS snippet,
                rank
         FROM notes_fts
         JOIN notes n ON n.id = notes_fts.rowid
         WHERE notes_fts MATCH ?
         ORDER BY rank
         LIMIT ?`,
      )
      .all(SNIPPET_MARK_OPEN, SNIPPET_MARK_CLOSE, SNIPPET_TOKENS, match, limit) as SearchResult[]
  }

  /**
   * Rewrites raw user input into a safe FTS5 `MATCH` string, or `null` when there
   * is nothing to search for.
   *
   * Strategy: drop any `"` (so a token can't break out of its phrase), split on
   * whitespace, keep only tokens carrying at least one letter or digit, wrap each
   * surviving token in double quotes (turning FTS5 operators like `*`, `(`, `:`
   * into harmless literal text the tokenizer simply splits on), and append `*` to
   * the last token so it matches as a prefix. The wrapped tokens are space-joined
   * — FTS5 reads that as an implicit AND.
   */
  private static toMatchQuery(raw: string): string | null {
    const tokens: string[] = []
    for (const part of raw.split(/\s+/)) {
      const cleaned = part.replace(/"/g, '')
      if (/[\p{L}\p{N}]/u.test(cleaned)) tokens.push(cleaned)
    }
    if (tokens.length === 0) return null

    const quoted = tokens.map((t) => `"${t}"`)
    quoted[quoted.length - 1] += '*'
    return quoted.join(' ')
  }
}
