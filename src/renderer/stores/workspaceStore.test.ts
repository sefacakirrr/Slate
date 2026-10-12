import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AUTO_SAVE_DEBOUNCE_MS, runTabMove, useWorkspaceStore } from './workspaceStore'

/**
 * The store reaches the main process only through `@renderer/api`. We replace it
 * with vi.fn() mocks (hoisted so the vi.mock factory can see them) and drive each
 * test by programming readNote/writeNote/getWorkspace per case. Pure store logic —
 * tabs, dirty math, save, close-prompt, persistence, restore — is all exercised
 * here; the CM6 view/state side lives in UAT.
 */
const { readNote, writeNote, getWorkspace, setWorkspace, getAutoSave, setAutoSave } = vi.hoisted(
  () => ({
    readNote: vi.fn(),
    writeNote: vi.fn(),
    getWorkspace: vi.fn(),
    setWorkspace: vi.fn(),
    getAutoSave: vi.fn(),
    setAutoSave: vi.fn(),
  }),
)

const { listNotes } = vi.hoisted(() => ({ listNotes: vi.fn() }))

const { externalRead, externalWrite } = vi.hoisted(() => ({
  externalRead: vi.fn(),
  externalWrite: vi.fn(),
}))

vi.mock('@renderer/api', () => ({
  api: {
    vault: { readNote, writeNote, listNotes },
    external: { read: externalRead, write: externalWrite },
    settings: { getWorkspace, setWorkspace, getAutoSave, setAutoSave },
    tags: { list: vi.fn().mockResolvedValue({ ok: true, data: [] }) },
  },
}))

/** Helpers that build the IpcResult discriminated union. */
const ok = <T>(data: T) => ({ ok: true as const, data })
const fail = (error: string) => ({ ok: false as const, error })

/** Program readNote to return file contents by path, failing for unknown paths. */
function vaultWith(files: Record<string, string>): void {
  readNote.mockImplementation((path: string) =>
    Promise.resolve(path in files ? ok(files[path]) : fail(`missing: ${path}`)),
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  useWorkspaceStore.setState({ tabs: [], activeTabPath: null, pendingClose: null, autoSave: false })
  // Sensible defaults; individual tests override as needed.
  writeNote.mockResolvedValue(ok(undefined))
  setWorkspace.mockResolvedValue(ok(undefined))
  getWorkspace.mockResolvedValue(ok({ openTabs: [], activeTab: null }))
  getAutoSave.mockResolvedValue(ok(true))
  setAutoSave.mockResolvedValue(ok(undefined))
})

const store = () => useWorkspaceStore.getState()

describe('openTab', () => {
  it('reads the file and adds an active tab', async () => {
    vaultWith({ 'a.md': 'hello' })
    await store().openTab('a.md')

    const { tabs, activeTabPath } = store()
    expect(tabs).toHaveLength(1)
    expect(tabs[0]).toMatchObject({ path: 'a.md', baseline: 'hello', draft: 'hello', dirty: false })
    expect(activeTabPath).toBe('a.md')
  })

  it('focuses an already-open tab instead of re-reading it', async () => {
    vaultWith({ 'a.md': 'A', 'b.md': 'B' })
    await store().openTab('a.md')
    await store().openTab('b.md')
    readNote.mockClear()

    await store().openTab('a.md')

    expect(readNote).not.toHaveBeenCalled()
    expect(store().tabs).toHaveLength(2)
    expect(store().activeTabPath).toBe('a.md')
  })

  it('does not add a tab when the read fails', async () => {
    vaultWith({})
    await store().openTab('gone.md')

    expect(store().tabs).toHaveLength(0)
    expect(store().activeTabPath).toBeNull()
  })

  it('persists the open-tab set after opening', async () => {
    vaultWith({ 'a.md': 'A' })
    await store().openTab('a.md')

    expect(setWorkspace).toHaveBeenLastCalledWith({ openTabs: ['a.md'], activeTab: 'a.md' })
  })
})

describe('activateTab', () => {
  it('switches the active tab when it exists', async () => {
    vaultWith({ 'a.md': 'A', 'b.md': 'B' })
    await store().openTab('a.md')
    await store().openTab('b.md')

    store().activateTab('a.md')
    expect(store().activeTabPath).toBe('a.md')
  })

  it('ignores activation of an unknown tab', async () => {
    vaultWith({ 'a.md': 'A' })
    await store().openTab('a.md')

    store().activateTab('nope.md')
    expect(store().activeTabPath).toBe('a.md')
  })
})

describe('setTabDraft', () => {
  it('marks a tab dirty when the draft diverges from baseline', async () => {
    vaultWith({ 'a.md': 'hello' })
    await store().openTab('a.md')

    store().setTabDraft('a.md', 'hello world')
    expect(store().tabs[0]).toMatchObject({ draft: 'hello world', dirty: true })
  })

  it('clears dirty when the draft returns to baseline', async () => {
    vaultWith({ 'a.md': 'hello' })
    await store().openTab('a.md')

    store().setTabDraft('a.md', 'changed')
    store().setTabDraft('a.md', 'hello')
    expect(store().tabs[0].dirty).toBe(false)
  })

  it('keeps per-tab dirty state independent', async () => {
    vaultWith({ 'a.md': 'A', 'b.md': 'B' })
    await store().openTab('a.md')
    await store().openTab('b.md')

    store().setTabDraft('a.md', 'A!')

    const byPath = Object.fromEntries(store().tabs.map((t) => [t.path, t.dirty]))
    expect(byPath).toEqual({ 'a.md': true, 'b.md': false })
  })
})

describe('closeTab', () => {
  it('removes a clean tab immediately', async () => {
    vaultWith({ 'a.md': 'A' })
    await store().openTab('a.md')

    store().closeTab('a.md')
    expect(store().tabs).toHaveLength(0)
    expect(store().pendingClose).toBeNull()
  })

  it('opens the close prompt for a dirty tab instead of closing it', async () => {
    vaultWith({ 'a.md': 'A' })
    await store().openTab('a.md')
    store().setTabDraft('a.md', 'A changed')

    store().closeTab('a.md')
    expect(store().tabs).toHaveLength(1)
    expect(store().pendingClose).toBe('a.md')
  })
})

describe('removeTab neighbor activation', () => {
  it('activates the left neighbor when closing the active tab', async () => {
    vaultWith({ 'a.md': 'A', 'b.md': 'B', 'c.md': 'C' })
    await store().openTab('a.md')
    await store().openTab('b.md')
    await store().openTab('c.md')
    store().activateTab('b.md')

    store().removeTab('b.md')
    expect(store().activeTabPath).toBe('a.md')
  })

  it('activates the new first tab when closing the active leftmost tab', async () => {
    vaultWith({ 'a.md': 'A', 'b.md': 'B' })
    await store().openTab('a.md')
    await store().openTab('b.md')
    store().activateTab('a.md')

    store().removeTab('a.md')
    expect(store().activeTabPath).toBe('b.md')
  })

  it('leaves the active tab untouched when closing a non-active one', async () => {
    vaultWith({ 'a.md': 'A', 'b.md': 'B' })
    await store().openTab('a.md')
    await store().openTab('b.md')
    store().activateTab('b.md')

    store().removeTab('a.md')
    expect(store().activeTabPath).toBe('b.md')
  })

  it('clears the active tab when the last tab closes', async () => {
    vaultWith({ 'a.md': 'A' })
    await store().openTab('a.md')

    store().removeTab('a.md')
    expect(store().tabs).toHaveLength(0)
    expect(store().activeTabPath).toBeNull()
  })
})

describe('saveTab', () => {
  it('writes the draft and clears dirty on success', async () => {
    vaultWith({ 'a.md': 'A' })
    await store().openTab('a.md')
    store().setTabDraft('a.md', 'A edited')

    await store().saveTab('a.md')

    expect(writeNote).toHaveBeenCalledWith({ path: 'a.md', content: 'A edited' })
    expect(store().tabs[0]).toMatchObject({ baseline: 'A edited', draft: 'A edited', dirty: false })
  })

  it('is a no-op for a clean tab', async () => {
    vaultWith({ 'a.md': 'A' })
    await store().openTab('a.md')

    await store().saveTab('a.md')
    expect(writeNote).not.toHaveBeenCalled()
  })

  it('keeps the tab dirty when the write fails', async () => {
    vaultWith({ 'a.md': 'A' })
    await store().openTab('a.md')
    store().setTabDraft('a.md', 'A edited')
    writeNote.mockResolvedValueOnce(fail('disk full'))

    await store().saveTab('a.md')
    expect(store().tabs[0]).toMatchObject({ baseline: 'A', dirty: true })
  })

  it('stays dirty when the draft changes during the async write', async () => {
    vaultWith({ 'a.md': 'A' })
    await store().openTab('a.md')
    store().setTabDraft('a.md', 'first edit')
    // Resolve the write only after we sneak in a newer keystroke.
    writeNote.mockImplementationOnce(() => {
      store().setTabDraft('a.md', 'newer edit')
      return Promise.resolve(ok(undefined))
    })

    await store().saveTab('a.md')

    expect(store().tabs[0]).toMatchObject({
      baseline: 'first edit',
      draft: 'newer edit',
      dirty: true,
    })
  })
})

describe('saveActiveTab', () => {
  it('saves the active tab', async () => {
    vaultWith({ 'a.md': 'A', 'b.md': 'B' })
    await store().openTab('a.md')
    await store().openTab('b.md')
    store().setTabDraft('b.md', 'B edited')

    await store().saveActiveTab()
    expect(writeNote).toHaveBeenCalledWith({ path: 'b.md', content: 'B edited' })
  })

  it('is a no-op when no tab is active', async () => {
    await store().saveActiveTab()
    expect(writeNote).not.toHaveBeenCalled()
  })
})

describe('close prompt resolution', () => {
  async function openDirty(path: string, baseline: string): Promise<void> {
    vaultWith({ [path]: baseline })
    await store().openTab(path)
    store().setTabDraft(path, `${baseline} edited`)
    store().closeTab(path)
  }

  it('Save: saves then closes the pending tab', async () => {
    await openDirty('a.md', 'A')

    await store().confirmCloseSave()

    expect(writeNote).toHaveBeenCalledWith({ path: 'a.md', content: 'A edited' })
    expect(store().tabs).toHaveLength(0)
    expect(store().pendingClose).toBeNull()
  })

  it('Save: keeps the prompt and the tab when the save fails', async () => {
    await openDirty('a.md', 'A')
    writeNote.mockResolvedValueOnce(fail('disk full'))

    await store().confirmCloseSave()

    expect(store().tabs).toHaveLength(1)
    expect(store().pendingClose).toBe('a.md')
  })

  it('Discard: closes the tab without writing', async () => {
    await openDirty('a.md', 'A')

    store().confirmCloseDiscard()

    expect(writeNote).not.toHaveBeenCalled()
    expect(store().tabs).toHaveLength(0)
    expect(store().pendingClose).toBeNull()
  })

  it('Cancel: keeps the tab and dismisses the prompt', async () => {
    await openDirty('a.md', 'A')

    store().cancelClose()

    expect(store().tabs).toHaveLength(1)
    expect(store().pendingClose).toBeNull()
    expect(store().tabs[0].dirty).toBe(true)
  })
})

describe('renameTab', () => {
  it('re-points an open tab and keeps its draft/baseline/dirty', async () => {
    vaultWith({ 'old.md': 'content' })
    await store().openTab('old.md')
    store().setTabDraft('old.md', 'content edited')

    store().renameTab('old.md', 'new.md')

    const tab = store().tabs[0]
    expect(tab).toMatchObject({
      path: 'new.md',
      baseline: 'content',
      draft: 'content edited',
      dirty: true,
    })
    expect(store().activeTabPath).toBe('new.md')
  })

  it('is a no-op when old and new paths match', async () => {
    vaultWith({ 'a.md': 'A' })
    await store().openTab('a.md')
    setWorkspace.mockClear()

    store().renameTab('a.md', 'a.md')
    expect(setWorkspace).not.toHaveBeenCalled()
  })
})

describe('reset', () => {
  it('clears all tabs and persists the empty workspace', async () => {
    vaultWith({ 'a.md': 'A', 'b.md': 'B' })
    await store().openTab('a.md')
    await store().openTab('b.md')

    store().reset()

    expect(store().tabs).toHaveLength(0)
    expect(store().activeTabPath).toBeNull()
    expect(setWorkspace).toHaveBeenLastCalledWith({ openTabs: [], activeTab: null })
  })
})

describe('auto-save (Epic 13)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useWorkspaceStore.setState({ autoSave: true })
  })

  afterEach(() => {
    // Clear any pending debounce timers so they can't leak across tests.
    useWorkspaceStore.getState().reset()
    vi.useRealTimers()
  })

  it('saves a dirty tab after the debounce interval', async () => {
    vaultWith({ 'a.md': 'A' })
    await store().openTab('a.md')
    store().setTabDraft('a.md', 'A edited')
    expect(writeNote).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(AUTO_SAVE_DEBOUNCE_MS)

    expect(writeNote).toHaveBeenCalledWith({ path: 'a.md', content: 'A edited' })
    expect(store().tabs[0]).toMatchObject({ baseline: 'A edited', dirty: false })
  })

  it('debounces: rapid keystrokes produce a single write with the final text', async () => {
    vaultWith({ 'a.md': 'A' })
    await store().openTab('a.md')

    store().setTabDraft('a.md', 'A e')
    await vi.advanceTimersByTimeAsync(AUTO_SAVE_DEBOUNCE_MS - 100)
    store().setTabDraft('a.md', 'A ed')
    await vi.advanceTimersByTimeAsync(AUTO_SAVE_DEBOUNCE_MS - 100)
    store().setTabDraft('a.md', 'A edited')
    expect(writeNote).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(AUTO_SAVE_DEBOUNCE_MS)

    expect(writeNote).toHaveBeenCalledTimes(1)
    expect(writeNote).toHaveBeenCalledWith({ path: 'a.md', content: 'A edited' })
  })

  it('does not schedule saves while the toggle is off', async () => {
    useWorkspaceStore.setState({ autoSave: false })
    vaultWith({ 'a.md': 'A' })
    await store().openTab('a.md')
    store().setTabDraft('a.md', 'A edited')

    await vi.advanceTimersByTimeAsync(AUTO_SAVE_DEBOUNCE_MS * 2)

    expect(writeNote).not.toHaveBeenCalled()
    expect(store().tabs[0].dirty).toBe(true)
  })

  it('turning the toggle off cancels a pending save', async () => {
    vaultWith({ 'a.md': 'A' })
    await store().openTab('a.md')
    store().setTabDraft('a.md', 'A edited')

    await store().setAutoSave(false)
    await vi.advanceTimersByTimeAsync(AUTO_SAVE_DEBOUNCE_MS * 2)

    expect(writeNote).not.toHaveBeenCalled()
    expect(setAutoSave).toHaveBeenCalledWith(false)
  })

  it('cancels the pending save when the draft returns to baseline', async () => {
    vaultWith({ 'a.md': 'A' })
    await store().openTab('a.md')
    store().setTabDraft('a.md', 'A edited')
    store().setTabDraft('a.md', 'A')

    await vi.advanceTimersByTimeAsync(AUTO_SAVE_DEBOUNCE_MS * 2)

    expect(writeNote).not.toHaveBeenCalled()
  })

  it('manual save flushes immediately and the stale timer does not double-write', async () => {
    vaultWith({ 'a.md': 'A' })
    await store().openTab('a.md')
    store().setTabDraft('a.md', 'A edited')

    await store().saveTab('a.md')
    expect(writeNote).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(AUTO_SAVE_DEBOUNCE_MS * 2)
    expect(writeNote).toHaveBeenCalledTimes(1)
  })

  it('closing a tab (discard) cancels its pending save', async () => {
    vaultWith({ 'a.md': 'A' })
    await store().openTab('a.md')
    store().setTabDraft('a.md', 'A edited')
    store().closeTab('a.md')
    store().confirmCloseDiscard()

    await vi.advanceTimersByTimeAsync(AUTO_SAVE_DEBOUNCE_MS * 2)

    expect(writeNote).not.toHaveBeenCalled()
  })

  it('external change while a save is pending: cancels the write and adopts disk content', async () => {
    vaultWith({ 'a.md': 'A' })
    await store().openTab('a.md')
    store().setTabDraft('a.md', 'A local edit')

    // The file changes on disk before the debounce fires.
    vaultWith({ 'a.md': 'A external' })
    const content = await store().reloadTab('a.md')

    expect(content).toBe('A external')
    expect(store().tabs[0]).toMatchObject({
      baseline: 'A external',
      draft: 'A external',
      dirty: false,
    })

    await vi.advanceTimersByTimeAsync(AUTO_SAVE_DEBOUNCE_MS * 2)
    expect(writeNote).not.toHaveBeenCalled()
  })

  it('reloadTab still skips a dirty tab when no auto-save is pending', async () => {
    useWorkspaceStore.setState({ autoSave: false })
    vaultWith({ 'a.md': 'A' })
    await store().openTab('a.md')
    store().setTabDraft('a.md', 'A local edit')

    vaultWith({ 'a.md': 'A external' })
    const content = await store().reloadTab('a.md')

    expect(content).toBeNull()
    expect(store().tabs[0]).toMatchObject({ draft: 'A local edit', dirty: true })
  })

  it('rename re-keys the pending save to the new path', async () => {
    vaultWith({ 'old.md': 'A' })
    await store().openTab('old.md')
    store().setTabDraft('old.md', 'A edited')

    store().renameTab('old.md', 'new.md')
    await vi.advanceTimersByTimeAsync(AUTO_SAVE_DEBOUNCE_MS)

    expect(writeNote).toHaveBeenCalledWith({ path: 'new.md', content: 'A edited' })
  })

  it('loadAutoSave adopts the persisted value', async () => {
    useWorkspaceStore.setState({ autoSave: false })
    getAutoSave.mockResolvedValueOnce(ok(true))

    await store().loadAutoSave()
    expect(store().autoSave).toBe(true)
  })
})

describe('restoreWorkspace', () => {
  it('re-opens persisted tabs and restores the active one', async () => {
    vaultWith({ 'a.md': 'A', 'b.md': 'B' })
    getWorkspace.mockResolvedValueOnce(ok({ openTabs: ['a.md', 'b.md'], activeTab: 'b.md' }))

    await store().restoreWorkspace()

    expect(store().tabs.map((t) => t.path)).toEqual(['a.md', 'b.md'])
    expect(store().activeTabPath).toBe('b.md')
  })

  it('skips files that no longer exist on disk', async () => {
    vaultWith({ 'a.md': 'A' }) // 'gone.md' is absent → read fails
    getWorkspace.mockResolvedValueOnce(ok({ openTabs: ['a.md', 'gone.md'], activeTab: 'a.md' }))

    await store().restoreWorkspace()

    expect(store().tabs.map((t) => t.path)).toEqual(['a.md'])
    expect(store().activeTabPath).toBe('a.md')
  })

  it('does not pin a missing active tab', async () => {
    vaultWith({ 'a.md': 'A' })
    getWorkspace.mockResolvedValueOnce(ok({ openTabs: ['a.md'], activeTab: 'gone.md' }))

    await store().restoreWorkspace()

    // active falls back to whatever openTab last activated (the opened tab).
    expect(store().activeTabPath).toBe('a.md')
  })

  it('does nothing when the workspace read fails', async () => {
    getWorkspace.mockResolvedValueOnce(fail('no settings'))

    await store().restoreWorkspace()

    expect(store().tabs).toHaveLength(0)
    expect(readNote).not.toHaveBeenCalled()
  })
})

describe('external (outside-vault) tabs', () => {
  const abs = 'C:\\Users\\me\\Desktop\\todo.txt'

  it('reads and saves an absolute-path tab through api.external, not the vault', async () => {
    externalRead.mockResolvedValue(ok('one'))
    externalWrite.mockResolvedValue(ok(undefined))
    await store().openTab(abs)
    expect(externalRead).toHaveBeenCalledWith(abs)
    expect(readNote).not.toHaveBeenCalled()
    expect(store().activeTabPath).toBe(abs)

    store().setTabDraft(abs, 'one two')
    expect(store().tabs[0].dirty).toBe(true)
    await store().saveTab(abs)
    expect(externalWrite).toHaveBeenCalledWith({ path: abs, content: 'one two' })
    expect(writeNote).not.toHaveBeenCalled()
    expect(store().tabs[0].dirty).toBe(false)
  })

  it('skips an external tab that can no longer be read', async () => {
    externalRead.mockResolvedValue(fail('not-found'))
    await store().openTab(abs)
    expect(store().tabs).toHaveLength(0)
  })
})

describe('bulk close with dirty tabs', () => {
  async function openFour(): Promise<void> {
    vaultWith({ 'a.md': 'A', 'b.md': 'B', 'c.md': 'C', 'd.md': 'D' })
    for (const p of ['a.md', 'b.md', 'c.md', 'd.md']) await store().openTab(p)
    store().setTabDraft('b.md', 'B!')
    store().setTabDraft('c.md', 'C!')
  }

  it('closes clean tabs and queues a prompt per dirty tab', async () => {
    await openFour()
    store().closeOtherTabs('a.md')
    expect(store().tabs.map((t) => t.path)).toEqual(['a.md', 'b.md', 'c.md'])
    expect(store().activeTabPath).toBe('a.md')
    expect(store().pendingClose).toBe('b.md')
    store().confirmCloseDiscard()
    expect(store().pendingClose).toBe('c.md')
    store().cancelClose()
    expect(store().pendingClose).toBeNull()
    expect(store().closeQueue).toEqual([])
    expect(store().tabs.map((t) => t.path)).toEqual(['a.md', 'c.md'])
  })

  it('Close All with Save writes each dirty tab before closing it', async () => {
    await openFour()
    store().closeAllTabs()
    await store().confirmCloseSave()
    await store().confirmCloseSave()
    expect(writeNote).toHaveBeenCalledWith({ path: 'b.md', content: 'B!' })
    expect(writeNote).toHaveBeenCalledWith({ path: 'c.md', content: 'C!' })
    expect(store().tabs).toEqual([])
    expect(store().pendingClose).toBeNull()
  })
})

describe('folder moves and saves', () => {
  it('re-points tabs inside a moved folder and keeps their drafts', async () => {
    vaultWith({ 'F/a.md': 'A', 'F/sub/b.md': 'B', 'Fx.md': 'X' })
    for (const p of ['F/a.md', 'F/sub/b.md', 'Fx.md']) await store().openTab(p)
    store().setTabDraft('F/a.md', 'A!')
    store().renameFolderTabs('F', 'G/F')
    expect(store().tabs.map((t) => t.path)).toEqual(['G/F/a.md', 'G/F/sub/b.md', 'Fx.md'])
    expect(store().tabs[0]).toMatchObject({ draft: 'A!', dirty: true })
  })

  it('saveTabsUnder saves only tabs at or under the path', async () => {
    vaultWith({ 'F/a.md': 'A', 'Fx.md': 'X' })
    await store().openTab('F/a.md')
    await store().openTab('Fx.md')
    store().setTabDraft('F/a.md', 'A!')
    store().setTabDraft('Fx.md', 'X!')
    expect(await store().saveTabsUnder('F')).toBe(true)
    expect(writeNote).toHaveBeenCalledTimes(1)
    writeNote.mockResolvedValue(fail('disk full'))
    expect(await store().saveTabsUnder('Fx.md')).toBe(false)
  })
})

describe('locked-note placeholders', () => {
  it('restores a locked tab as a placeholder with no content, skipping missing ones', async () => {
    readNote.mockImplementation((path: string) =>
      Promise.resolve(path === 'a.md' ? ok('A') : fail('note-locked')),
    )
    listNotes.mockResolvedValue(ok(['a.md', 's.md.enc']))
    getWorkspace.mockResolvedValueOnce(
      ok({ openTabs: ['a.md', 's.md.enc', 'gone.md.enc'], activeTab: 's.md.enc' }),
    )

    await store().restoreWorkspace()

    expect(store().tabs.map((t) => t.path)).toEqual(['a.md', 's.md.enc'])
    expect(store().tabs[1]).toEqual({
      path: 's.md.enc',
      baseline: '',
      draft: '',
      dirty: false,
      locked: true,
    })
    expect(store().activeTabPath).toBe('s.md.enc')
  })

  it('openTab on a placeholder loads the note once it can be read', async () => {
    useWorkspaceStore.setState({
      tabs: [{ path: 's.md.enc', baseline: '', draft: '', dirty: false, locked: true }],
      activeTabPath: null,
    })
    vaultWith({ 's.md.enc': 'secret' })
    await store().openTab('s.md.enc')
    expect(store().tabs).toEqual([
      { path: 's.md.enc', baseline: 'secret', draft: 'secret', dirty: false },
    ])
    expect(store().activeTabPath).toBe('s.md.enc')
  })

  it('lockTabs drops the text and ignores edits/saves while locked', async () => {
    vaultWith({ 's.md.enc': 'secret', 'p.md': 'P' })
    await store().openTab('p.md')
    await store().openTab('s.md.enc')
    store().lockTabs(['s.md.enc'])
    expect(store().tabs[1]).toMatchObject({ draft: '', baseline: '', locked: true })
    expect(store().tabs[0]).toMatchObject({ draft: 'P' })
    store().setTabDraft('s.md.enc', 'typed')
    await store().saveTab('s.md.enc')
    expect(store().tabs[1].draft).toBe('')
    expect(writeNote).not.toHaveBeenCalled()
  })
})

describe('saves during a file move', () => {
  it('waits for the move and writes to the renamed path', async () => {
    vaultWith({ 'a.md': 'A' })
    await store().openTab('a.md')
    store().setTabDraft('a.md', 'A!')

    let finishMove = () => {}
    const moved = new Promise<void>((r) => {
      finishMove = r
    })
    const move = runTabMove(async () => {
      await moved
      store().renameTab('a.md', 'a.txt')
    })
    // Ctrl+S while the rename IPC is still in flight.
    const save = store().saveTab('a.md')
    await Promise.resolve()
    expect(writeNote).not.toHaveBeenCalled()
    finishMove()
    await move
    await save
    expect(writeNote).toHaveBeenCalledWith({ path: 'a.txt', content: 'A!' })
    expect(store().tabs[0]).toMatchObject({ path: 'a.txt', dirty: false })
  })

  it('a move waits for a save already in flight', async () => {
    vaultWith({ 'a.md': 'A' })
    await store().openTab('a.md')
    store().setTabDraft('a.md', 'A!')
    let finishWrite = (_: unknown) => {}
    writeNote.mockImplementationOnce(
      () =>
        new Promise((r) => {
          finishWrite = r
        }),
    )
    const order: string[] = []
    const save = store()
      .saveTab('a.md')
      .then(() => order.push('saved'))
    await vi.waitFor(() => expect(writeNote).toHaveBeenCalled())
    const move = runTabMove(async () => {
      order.push('moved')
    })
    await Promise.resolve()
    expect(order).toEqual([])
    finishWrite(ok(undefined))
    await Promise.all([save, move])
    expect(order.sort()).toEqual(['moved', 'saved'])
  })
})
