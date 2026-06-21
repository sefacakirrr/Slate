import type { SearchResult } from '@shared/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSearchStore } from './searchStore'

/**
 * The store reaches the main process only through `@renderer/api`. We replace
 * `api.search.query` with a hoisted vi.fn() and drive each test. Pure store
 * logic — open/close reset, empty-query short-circuit, and the stale-response
 * (seq) guard — is exercised here; the panel/debounce/DOM side lives in UAT.
 */
const { query } = vi.hoisted(() => ({ query: vi.fn() }))

vi.mock('@renderer/api', () => ({
  api: { search: { query } },
}))

const ok = <T>(data: T) => ({ ok: true as const, data })
const fail = (error: string) => ({ ok: false as const, error })

const hit = (path: string): SearchResult => ({ path, snippet: path, rank: -1 })

beforeEach(() => {
  vi.clearAllMocks()
  useSearchStore.setState({ open: false, query: '', results: [], loading: false, seq: 0 })
})

const store = () => useSearchStore.getState()

describe('panel open/close', () => {
  it('opens, and closing resets query + results to a clean slate', () => {
    useSearchStore.setState({ open: true, query: 'foo', results: [hit('a.md')] })
    store().closePanel()
    expect(store()).toMatchObject({ open: false, query: '', results: [], loading: false })
  })

  it('toggles between open and closed', () => {
    store().togglePanel()
    expect(store().open).toBe(true)
    store().togglePanel()
    expect(store().open).toBe(false)
  })
})

describe('runQuery', () => {
  it('returns ranked results for a non-empty query', async () => {
    query.mockResolvedValue(ok([hit('a.md'), hit('b.md')]))
    await store().runQuery('needle')
    expect(query).toHaveBeenCalledWith('needle')
    expect(store().results.map((r) => r.path)).toEqual(['a.md', 'b.md'])
    expect(store().loading).toBe(false)
  })

  it('clears results without an IPC call for an empty or whitespace query', async () => {
    useSearchStore.setState({ results: [hit('old.md')] })
    await store().runQuery('   ')
    expect(query).not.toHaveBeenCalled()
    expect(store().results).toEqual([])
  })

  it('trims the query before querying', async () => {
    query.mockResolvedValue(ok([]))
    await store().runQuery('  spaced  ')
    expect(query).toHaveBeenCalledWith('spaced')
  })

  it('ignores a stale response when a newer query started mid-flight', async () => {
    // First query resolves slowly with stale results.
    let resolveFirst: (v: ReturnType<typeof ok<SearchResult[]>>) => void = () => {}
    query.mockReturnValueOnce(new Promise((r) => (resolveFirst = r)))
    const first = store().runQuery('old')

    // Second query starts and settles first with the fresh results.
    query.mockResolvedValueOnce(ok([hit('fresh.md')]))
    await store().runQuery('new')
    expect(store().results.map((r) => r.path)).toEqual(['fresh.md'])

    // Now the stale first response arrives — it must NOT overwrite.
    resolveFirst(ok([hit('stale.md')]))
    await first
    expect(store().results.map((r) => r.path)).toEqual(['fresh.md'])
  })

  it('clears results and stops loading when the query fails', async () => {
    useSearchStore.setState({ results: [hit('old.md')] })
    query.mockResolvedValue(fail('boom'))
    await store().runQuery('x')
    expect(store().results).toEqual([])
    expect(store().loading).toBe(false)
  })
})
