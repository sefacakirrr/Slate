import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useStickyStore } from './stickyStore'

/**
 * The sticky store reaches main only through `@renderer/api`. We mock the vault
 * methods and drive the store directly. Pure logic — autosave debounce and the
 * reload-if-not-dirty guard — is tested here; the editor/DOM side lives in UAT.
 */
const { readNote, writeNote } = vi.hoisted(() => ({ readNote: vi.fn(), writeNote: vi.fn() }))

vi.mock('@renderer/api', () => ({
  api: { vault: { readNote, writeNote } },
}))

const ok = <T>(data: T) => ({ ok: true as const, data })

const store = () => useStickyStore.getState()

beforeEach(() => {
  vi.clearAllMocks()
  vi.useRealTimers()
  useStickyStore.setState({
    path: 'note.md',
    baseline: 'hello',
    draft: 'hello',
    dirty: false,
    status: 'ready',
    error: null,
  })
})

describe('autosave (debounced)', () => {
  it('saves once ~800ms after the last edit, with the latest content', async () => {
    vi.useFakeTimers()
    writeNote.mockResolvedValue(ok(undefined))

    store().setDraft('hello a')
    store().setDraft('hello ab') // rapid second edit resets the debounce

    expect(writeNote).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(800)

    expect(writeNote).toHaveBeenCalledTimes(1)
    expect(writeNote).toHaveBeenCalledWith({ path: 'note.md', content: 'hello ab' })
  })

  it('does not autosave when the draft returns to the baseline (not dirty)', async () => {
    vi.useFakeTimers()
    writeNote.mockResolvedValue(ok(undefined))
    store().setDraft('hello') // same as baseline → not dirty
    await vi.advanceTimersByTimeAsync(800)
    expect(writeNote).not.toHaveBeenCalled()
  })
})

describe('reloadFromDisk', () => {
  it('applies new disk content when the sticky is not dirty', async () => {
    readNote.mockResolvedValue(ok('updated from elsewhere'))
    const content = await store().reloadFromDisk()
    expect(content).toBe('updated from elsewhere')
    expect(store()).toMatchObject({
      baseline: 'updated from elsewhere',
      draft: 'updated from elsewhere',
      dirty: false,
    })
  })

  it('returns null and keeps edits when the sticky is dirty', async () => {
    useStickyStore.setState({ draft: 'my unsaved edit', dirty: true })
    readNote.mockResolvedValue(ok('different disk content'))
    expect(await store().reloadFromDisk()).toBeNull()
    expect(store().draft).toBe('my unsaved edit')
    expect(readNote).not.toHaveBeenCalled()
  })

  it('returns null when disk already matches the draft (own save / no change)', async () => {
    readNote.mockResolvedValue(ok('hello'))
    expect(await store().reloadFromDisk()).toBeNull()
  })
})
