import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { IndexService } from './IndexService'

/**
 * Runs under Electron's Node runtime (see scripts/run-vitest-electron.mjs) so the
 * Electron-ABI `better-sqlite3` binary loads. Each test gets a fresh temp-file db;
 * assertions go through search (`paths(...)`) rather than internal table state, so
 * we test observable behavior — the FTS index actually matching — not bookkeeping.
 */
let dir: string
let index: IndexService

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'slate-index-'))
  index = new IndexService(join(dir, 'index.db'))
})

afterEach(async () => {
  index.close()
  await rm(dir, { recursive: true, force: true })
})

/** Helper: matching paths for a query, via the shared connection + FTS join. */
function paths(query: string): string[] {
  return index.connection
    .prepare(
      `SELECT n.path FROM notes_fts f JOIN notes n ON n.id = f.rowid
       WHERE notes_fts MATCH ? ORDER BY n.path`,
    )
    .all(query)
    .map((r) => (r as { path: string }).path)
}

describe('indexNote', () => {
  it('makes a note findable by a word in its content', () => {
    index.indexNote('a.md', 'the quick brown fox', 100)
    expect(paths('quick')).toEqual(['a.md'])
    expect(paths('elephant')).toEqual([])
  })

  it('scopes a match to the note that contains the term', () => {
    index.indexNote('a.md', 'alpha beta', 1)
    index.indexNote('b.md', 'beta gamma', 1)
    expect(paths('alpha')).toEqual(['a.md'])
    expect(paths('gamma')).toEqual(['b.md'])
    expect(paths('beta')).toEqual(['a.md', 'b.md'])
  })

  it('updates content in place without duplicating the path (upsert)', () => {
    index.indexNote('a.md', 'original words', 1)
    index.indexNote('a.md', 'replacement text', 2)
    // Old terms gone, new terms present, still a single row for the path.
    expect(paths('original')).toEqual([])
    expect(paths('replacement')).toEqual(['a.md'])
    const count = index.connection
      .prepare('SELECT count(*) c FROM notes WHERE path = ?')
      .get('a.md') as { c: number }
    expect(count.c).toBe(1)
  })

  it('records the latest mtime on re-index', () => {
    index.indexNote('a.md', 'x', 1)
    index.indexNote('a.md', 'x', 99)
    expect(index.getIndexed()).toEqual([{ path: 'a.md', mtime: 99 }])
  })
})

describe('removeNote', () => {
  it('drops a note from the index', () => {
    index.indexNote('a.md', 'findme', 1)
    index.removeNote('a.md')
    expect(paths('findme')).toEqual([])
    expect(index.getIndexed()).toEqual([])
  })

  it('is a no-op for an unknown path', () => {
    index.indexNote('a.md', 'keep', 1)
    expect(() => index.removeNote('ghost.md')).not.toThrow()
    expect(paths('keep')).toEqual(['a.md'])
  })
})

describe('renameNote', () => {
  it('re-points a note to a new path, preserving its content', () => {
    index.indexNote('old.md', 'preserved content', 1)
    index.renameNote('old.md', 'new.md')
    expect(paths('preserved')).toEqual(['new.md'])
    expect(index.getIndexed()).toEqual([{ path: 'new.md', mtime: 1 }])
  })

  it('is a no-op when the source path is not indexed', () => {
    expect(() => index.renameNote('missing.md', 'whatever.md')).not.toThrow()
    expect(index.getIndexed()).toEqual([])
  })
})

describe('rebuild', () => {
  it('replaces the index wholesale with the provided set', () => {
    index.indexNote('stale.md', 'old data', 1)
    index.rebuild([
      { path: 'x.md', content: 'fresh apple', mtime: 5 },
      { path: 'y.md', content: 'fresh banana', mtime: 6 },
    ])
    expect(paths('old')).toEqual([]) // pre-rebuild note gone
    expect(paths('apple')).toEqual(['x.md'])
    expect(paths('fresh')).toEqual(['x.md', 'y.md'])
    expect(index.getIndexed()).toEqual([
      { path: 'x.md', mtime: 5 },
      { path: 'y.md', mtime: 6 },
    ])
  })

  it('clears the index when rebuilt from an empty set', () => {
    index.indexNote('a.md', 'something', 1)
    index.rebuild([])
    expect(index.getIndexed()).toEqual([])
    expect(paths('something')).toEqual([])
  })
})

describe('persistence', () => {
  it('survives a reopen of the same db file', () => {
    const dbPath = join(dir, 'reopen.db')
    const first = new IndexService(dbPath)
    first.indexNote('a.md', 'durable content', 7)
    first.close()

    const second = new IndexService(dbPath)
    expect(second.getIndexed()).toEqual([{ path: 'a.md', mtime: 7 }])
    second.close()
  })
})

describe('tags — syncTags + listTags + notesForTag', () => {
  it('indexNote extracts and stores tags from content', () => {
    index.indexNote('a.md', 'Hello #javascript and #react', 1)
    const tags = index.listTags()
    expect(tags).toEqual([
      { name: 'javascript', count: 1 },
      { name: 'react', count: 1 },
    ])
  })

  it('listTags returns tags ordered by count DESC then name ASC', () => {
    index.indexNote('a.md', '#alpha #beta', 1)
    index.indexNote('b.md', '#beta #gamma', 1)
    index.indexNote('c.md', '#beta', 1)
    const tags = index.listTags()
    expect(tags[0]).toEqual({ name: 'beta', count: 3 })
    expect(tags[1]).toEqual({ name: 'alpha', count: 1 })
    expect(tags[2]).toEqual({ name: 'gamma', count: 1 })
  })

  it('notesForTag returns paths for a given tag', () => {
    index.indexNote('a.md', '#javascript rocks', 1)
    index.indexNote('b.md', '#javascript too', 1)
    index.indexNote('c.md', '#python only', 1)
    expect(index.notesForTag('javascript')).toEqual(['a.md', 'b.md'])
    expect(index.notesForTag('python')).toEqual(['c.md'])
    expect(index.notesForTag('nonexistent')).toEqual([])
  })

  it('notesForTag is case-insensitive', () => {
    index.indexNote('a.md', '#JavaScript', 1)
    expect(index.notesForTag('JAVASCRIPT')).toEqual(['a.md'])
  })

  it('removeNote cascades to note_tags (tag count drops)', () => {
    index.indexNote('a.md', '#foo #bar', 1)
    index.indexNote('b.md', '#foo', 1)
    index.removeNote('a.md')
    expect(index.listTags()).toEqual([{ name: 'foo', count: 1 }])
    expect(index.notesForTag('bar')).toEqual([])
  })

  it('updating a note removes stale tags and adds new ones', () => {
    index.indexNote('a.md', '#old-tag #keep', 1)
    index.indexNote('a.md', '#keep #new-tag', 2)
    const tags = index.listTags()
    const names = tags.map((t) => t.name).sort()
    expect(names).toEqual(['keep', 'new-tag'])
    expect(index.notesForTag('old-tag')).toEqual([])
  })

  it('renameNote preserves tag associations', () => {
    index.indexNote('old.md', '#preserved', 1)
    index.renameNote('old.md', 'new.md')
    expect(index.notesForTag('preserved')).toEqual(['new.md'])
  })

  it('rebuild re-syncs all tags from content', () => {
    index.indexNote('a.md', '#stale-tag', 1)
    index.rebuild([
      { path: 'a.md', content: '#fresh-tag', mtime: 2 },
      { path: 'b.md', content: '#fresh-tag #other', mtime: 2 },
    ])
    expect(index.notesForTag('stale-tag')).toEqual([])
    expect(index.notesForTag('fresh-tag')).toEqual(['a.md', 'b.md'])
    expect(index.listTags()).toEqual([
      { name: 'fresh-tag', count: 2 },
      { name: 'other', count: 1 },
    ])
  })

  it('tags inside code blocks are not extracted', () => {
    index.indexNote('a.md', '```\n#include <stdio>\n```\n#real-tag', 1)
    expect(index.listTags()).toEqual([{ name: 'real-tag', count: 1 }])
  })
})
