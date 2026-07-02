import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AUTO_SAVE_DEBOUNCE_MS, useWorkspaceStore } from './workspaceStore'

/**
 * Epic 13 integration smoke test: editor draft → debounce → writeNote → file on
 * disk. The `@renderer/api` mock is backed by real filesystem reads/writes over
 * a temp vault (not canned values), so the assertion is on actual bytes on disk.
 * VaultService's own atomic-write behavior is covered by its unit tests; the
 * main-process boundary stays un-imported here (renderer tests typecheck under
 * tsconfig.web, which excludes src/main).
 */
const rootRef = vi.hoisted(() => ({ current: '' }))
/**
 * In-flight writeNote promises. The debounce timer fires saveTab as
 * fire-and-forget, so under fake timers the test must explicitly await the
 * real disk IO before asserting on file content.
 */
const inflight = vi.hoisted(() => ({ writes: [] as Promise<unknown>[] }))

async function flushWrites(): Promise<void> {
  await Promise.all(inflight.writes)
  inflight.writes.length = 0
}

vi.mock('@renderer/api', async () => {
  const { readFile: read, writeFile: write } = await import('node:fs/promises')
  const { join: joinPath } = await import('node:path')
  const ok = <T>(data: T) => ({ ok: true as const, data })
  const fail = (error: string) => ({ ok: false as const, error })
  return {
    api: {
      vault: {
        readNote: async (path: string) => {
          try {
            return ok(await read(joinPath(rootRef.current, path), 'utf-8'))
          } catch (err) {
            return fail(String(err))
          }
        },
        writeNote: (req: { path: string; content: string }) => {
          const p = write(joinPath(rootRef.current, req.path), req.content, 'utf-8').then(
            () => ok(undefined),
            (err) => fail(String(err)),
          )
          inflight.writes.push(p)
          return p
        },
      },
      settings: {
        getWorkspace: async () => ok({ openTabs: [], activeTab: null }),
        setWorkspace: async () => ok(undefined),
        getAutoSave: async () => ok(true),
        setAutoSave: async () => ok(undefined),
      },
      tags: { list: async () => ok([]) },
    },
  }
})

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'slate-autosave-'))
  rootRef.current = root
  useWorkspaceStore.setState({ tabs: [], activeTabPath: null, pendingClose: null, autoSave: true })
  vi.useFakeTimers()
})

afterEach(async () => {
  // Clear tabs and any pending debounce timers before removing the temp vault,
  // so no stray write lands mid-cleanup.
  useWorkspaceStore.getState().reset()
  vi.useRealTimers()
  await flushWrites()
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
})

describe('auto-save end to end (Epic 13)', () => {
  it('a typed draft reaches the file on disk after the debounce', async () => {
    await writeFile(join(root, 'note.md'), '', 'utf-8')
    await useWorkspaceStore.getState().openTab('note.md')

    useWorkspaceStore.getState().setTabDraft('note.md', '# Hello\n\nauto-saved')
    // Nothing on disk yet — the debounce is still pending.
    expect(await readFile(join(root, 'note.md'), 'utf-8')).toBe('')

    await vi.advanceTimersByTimeAsync(AUTO_SAVE_DEBOUNCE_MS)
    await flushWrites()

    expect(await readFile(join(root, 'note.md'), 'utf-8')).toBe('# Hello\n\nauto-saved')
    expect(useWorkspaceStore.getState().tabs[0].dirty).toBe(false)
  })

  it('rapid edits produce the final text on disk, written once', async () => {
    await writeFile(join(root, 'note.md'), '', 'utf-8')
    await useWorkspaceStore.getState().openTab('note.md')

    for (const draft of ['a', 'ab', 'abc', 'abcd']) {
      useWorkspaceStore.getState().setTabDraft('note.md', draft)
      await vi.advanceTimersByTimeAsync(AUTO_SAVE_DEBOUNCE_MS / 2)
    }
    await vi.advanceTimersByTimeAsync(AUTO_SAVE_DEBOUNCE_MS)
    await flushWrites()

    expect(await readFile(join(root, 'note.md'), 'utf-8')).toBe('abcd')
  })

  it('Ctrl+S (saveActiveTab) flushes to disk immediately, before the debounce', async () => {
    await writeFile(join(root, 'note.md'), '', 'utf-8')
    await useWorkspaceStore.getState().openTab('note.md')
    useWorkspaceStore.getState().setTabDraft('note.md', 'flushed now')

    await useWorkspaceStore.getState().saveActiveTab()

    expect(await readFile(join(root, 'note.md'), 'utf-8')).toBe('flushed now')
  })
})
