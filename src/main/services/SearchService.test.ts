import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { IndexService } from './IndexService'
import { SearchService, SNIPPET_MARK_CLOSE, SNIPPET_MARK_OPEN } from './SearchService'

/**
 * Runs under Electron's Node runtime (see scripts/run-vitest-electron.mjs) so the
 * Electron-ABI `better-sqlite3` binary loads. Each test gets a fresh temp-file
 * index seeded through {@link IndexService}; {@link SearchService} then reads the
 * same connection. Assertions go through `search()` — observable behavior — not
 * internal table state.
 */
let dir: string
let index: IndexService
let search: SearchService

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'slate-search-'))
  index = new IndexService(join(dir, 'index.db'))
  search = new SearchService(index.connection)
})

afterEach(async () => {
  index.close()
  await rm(dir, { recursive: true, force: true })
})

/** Just the paths from a result set, in returned (rank) order. */
function paths(query: string): string[] {
  return search.search(query).map((r) => r.path)
}

describe('search', () => {
  it('returns matching notes and omits non-matching ones', () => {
    index.indexNote('a.md', 'the quick brown fox', 1)
    index.indexNote('b.md', 'lazy dog sleeps', 1)
    expect(paths('quick')).toEqual(['a.md'])
    expect(paths('dog')).toEqual(['b.md'])
    expect(paths('elephant')).toEqual([])
  })

  it('orders results best-first by rank', () => {
    // b.md hits the term twice in a short doc → stronger bm25 score than a.md,
    // where the term is one word buried in a long doc.
    index.indexNote('a.md', `needle ${'filler '.repeat(40)}`, 1)
    index.indexNote('b.md', 'needle needle', 1)
    expect(paths('needle')).toEqual(['b.md', 'a.md'])
  })

  it('narrows on multiple terms (implicit AND)', () => {
    index.indexNote('a.md', 'alpha beta', 1)
    index.indexNote('b.md', 'alpha gamma', 1)
    expect(paths('alpha beta')).toEqual(['a.md'])
  })

  it('matches the final token as a prefix (as-you-type)', () => {
    index.indexNote('a.md', 'reconciliation', 1)
    expect(paths('recon')).toEqual(['a.md'])
    expect(paths('reconciliation')).toEqual(['a.md'])
  })

  it('respects the result limit', () => {
    for (let i = 0; i < 5; i++) index.indexNote(`n${i}.md`, 'shared term', i)
    expect(search.search('shared', 2)).toHaveLength(2)
  })
})

describe('snippet', () => {
  it('wraps the matched term in the snippet sentinels', () => {
    index.indexNote('a.md', 'find the keyword inside this sentence', 1)
    const [hit] = search.search('keyword')
    expect(hit.snippet).toContain(`${SNIPPET_MARK_OPEN}keyword${SNIPPET_MARK_CLOSE}`)
  })
})

describe('query sanitization (never throws)', () => {
  beforeEach(() => {
    index.indexNote('a.md', 'foobar function baz', 1)
  })

  it('returns [] for empty, whitespace, or punctuation-only input', () => {
    expect(search.search('')).toEqual([])
    expect(search.search('   ')).toEqual([])
    expect(search.search('"')).toEqual([])
    expect(search.search('*')).toEqual([])
    expect(search.search('()')).toEqual([])
  })

  it('does not throw on FTS5 special characters, treating them as literal', () => {
    // Each of these would be an FTS5 syntax error if passed raw.
    expect(() => search.search('foo(')).not.toThrow()
    expect(() => search.search('foo"bar')).not.toThrow()
    expect(() => search.search('foo:bar')).not.toThrow()
    expect(() => search.search('NEAR(a b)')).not.toThrow()
    expect(() => search.search('a AND OR *')).not.toThrow()
  })

  it('still finds notes when the query carries stray punctuation', () => {
    // `foo(` → safe prefix term `"foo("*` → tokenizes to `foo` prefix → hits foobar.
    expect(paths('foo(')).toEqual(['a.md'])
  })
})
