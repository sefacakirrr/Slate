import { beforeEach, describe, expect, it, vi } from 'vitest'

const { readNote, writeNote, externalRead, externalWrite } = vi.hoisted(() => ({
  readNote: vi.fn(),
  writeNote: vi.fn(),
  externalRead: vi.fn(),
  externalWrite: vi.fn(),
}))

vi.mock('@renderer/api', () => ({
  api: {
    vault: { readNote, writeNote },
    external: { read: externalRead, write: externalWrite },
    settings: { setWorkspace: vi.fn().mockResolvedValue({ ok: true, data: undefined }) },
    tags: { list: vi.fn().mockResolvedValue({ ok: true, data: [] }) },
  },
}))

import { onDiskContent, useDiskSyncStore } from './diskSyncStore'
import { useWorkspaceStore } from './workspaceStore'

const ok = <T>(data: T) => ({ ok: true as const, data })
const fail = (error: string) => ({ ok: false as const, error })

const EXT = 'C:\\Users\\me\\notes.md'
const ws = () => useWorkspaceStore.getState()
const sync = () => useDiskSyncStore.getState()

/** One open tab at `path`: loaded as `baseline`, edited to `draft`. */
function openTab(path: string, baseline: string, draft = baseline): void {
  useWorkspaceStore.setState({
    tabs: [{ path, baseline, draft, dirty: draft !== baseline }],
    activeTabPath: path,
  })
}

let disk: Record<string, string | null>

beforeEach(() => {
  vi.clearAllMocks()
  useDiskSyncStore.setState({ conflict: null, missing: [] })
  disk = {}
  const reader = (p: string) =>
    Promise.resolve(typeof disk[p] === 'string' ? ok(disk[p]) : fail('not-found'))
  const writer = (req: { path: string; content: string }) => {
    disk[req.path] = req.content
    return Promise.resolve(ok(undefined))
  }
  readNote.mockImplementation(reader)
  externalRead.mockImplementation(reader)
  writeNote.mockImplementation(writer)
  externalWrite.mockImplementation(writer)
})

describe('save conflict check', () => {
  it('writes when the disk still holds the baseline', async () => {
    disk['a.md'] = 'one'
    openTab('a.md', 'one', 'two')
    await ws().saveTab('a.md')
    expect(disk['a.md']).toBe('two')
    expect(sync().conflict).toBeNull()
  })

  it('does not write over an outside change; raises the prompt instead', async () => {
    disk[EXT] = 'theirs'
    openTab(EXT, 'one', 'mine')
    await ws().saveTab(EXT)
    expect(externalWrite).not.toHaveBeenCalled()
    expect(sync().conflict).toEqual({ path: EXT, disk: 'theirs' })
    expect(ws().tabs[0].dirty).toBe(true)
  })

  it('Overwrite writes ours; Reload adopts theirs and notifies the editor', async () => {
    disk[EXT] = 'theirs'
    openTab(EXT, 'one', 'mine')
    await ws().saveTab(EXT)
    await sync().overwrite()
    expect(disk[EXT]).toBe('mine')
    expect(ws().tabs[0]).toMatchObject({ baseline: 'mine', dirty: false })

    disk[EXT] = 'theirs again'
    ws().setTabDraft(EXT, 'mine 2')
    await ws().saveTab(EXT)
    const seen: string[] = []
    const off = onDiskContent((_p, c) => seen.push(c))
    await sync().reload()
    off()
    expect(ws().tabs[0]).toMatchObject({ baseline: 'theirs again', draft: 'theirs again' })
    expect(ws().tabs[0].dirty).toBe(false)
    expect(seen).toEqual(['theirs again'])
    expect(disk[EXT]).toBe('theirs again')
  })

  it('after Cancel, auto-saves stay quiet for that disk version; a manual save asks again', async () => {
    disk['a.md'] = 'theirs'
    openTab('a.md', 'one', 'mine')
    await ws().saveTab('a.md', { auto: true })
    sync().cancel()
    await ws().saveTab('a.md', { auto: true })
    expect(sync().conflict).toBeNull()
    expect(writeNote).not.toHaveBeenCalled()

    await ws().saveTab('a.md')
    expect(sync().conflict?.path).toBe('a.md')
    sync().cancel()

    // The disk moves on again → auto-save prompts once more.
    disk['a.md'] = 'theirs v2'
    await ws().saveTab('a.md', { auto: true })
    expect(sync().conflict?.disk).toBe('theirs v2')
  })

  it('a deleted file is recreated by saving', async () => {
    openTab(EXT, 'one', 'two')
    useDiskSyncStore.setState({ missing: [EXT] })
    await ws().saveTab(EXT)
    expect(disk[EXT]).toBe('two')
    expect(sync().missing).toEqual([])
  })
})

describe('focus check', () => {
  it('reloads a clean tab that changed, leaves a dirty one alone, marks a deleted external file', async () => {
    disk['clean.md'] = 'new'
    disk['dirty.md'] = 'new'
    useWorkspaceStore.setState({
      tabs: [
        { path: 'clean.md', baseline: 'old', draft: 'old', dirty: false },
        { path: 'dirty.md', baseline: 'old', draft: 'edit', dirty: true },
        { path: EXT, baseline: 'x', draft: 'x', dirty: false },
        { path: 'locked.md', baseline: 'y', draft: 'y', dirty: false },
      ],
      activeTabPath: 'clean.md',
    })
    await sync().checkOpenTabs()
    const byPath = Object.fromEntries(ws().tabs.map((t) => [t.path, t]))
    expect(byPath['clean.md']).toMatchObject({ baseline: 'new', draft: 'new', dirty: false })
    expect(byPath['dirty.md']).toMatchObject({ baseline: 'old', draft: 'edit', dirty: true })
    expect(byPath[EXT].draft).toBe('x')
    // External gone → marked; an unreadable vault note (e.g. locked) is not.
    expect(sync().missing).toEqual([EXT])

    disk[EXT] = 'x'
    await sync().checkOpenTabs()
    expect(sync().missing).toEqual([])
  })
})

describe('line endings and BOM', () => {
  it('a CRLF/BOM file matching the LF baseline is neither a conflict nor a reload', async () => {
    disk['crlf.md'] = '\uFEFFa\r\nb\r\n'
    openTab('crlf.md', 'a\nb\n', 'a\nb\nc')
    await ws().saveTab('crlf.md')
    expect(sync().conflict).toBeNull()
    expect(disk['crlf.md']).toBe('a\nb\nc')

    disk['clean.md'] = 'x\r\ny\r\n'
    openTab('clean.md', 'x\r\ny\r\n')
    await sync().checkOpenTabs()
    expect(ws().tabs[0]).toMatchObject({ baseline: 'x\r\ny\r\n', dirty: false })
  })

  it('a reloaded CRLF file is adopted as LF so the editor echo stays clean', async () => {
    disk['clean.md'] = 'new\r\ntext\r\n'
    openTab('clean.md', 'old\n')
    await sync().checkOpenTabs()
    expect(ws().tabs[0]).toMatchObject({ baseline: 'new\ntext\n', draft: 'new\ntext\n' })
    ws().setTabDraft('clean.md', 'new\ntext\n')
    expect(ws().tabs[0].dirty).toBe(false)
  })
})
