import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { IndexService } from './IndexService'
import { reconcileIndex } from './reconcile'
import { SearchService } from './SearchService'
import { VaultService } from './VaultService'

/**
 * Runs under Electron's Node runtime (see scripts/run-vitest-electron.mjs) so the
 * Electron-ABI `better-sqlite3` binary loads. Each test gets a fresh temp vault +
 * temp index db; assertions go through `search()` — observable behavior — so the
 * test verifies the index actually reflects disk, not internal bookkeeping.
 */
let dir: string
let vaultRoot: string
let vault: VaultService
let index: IndexService
let search: SearchService

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'slate-reconcile-'))
  vaultRoot = join(dir, 'vault')
  vault = new VaultService(vaultRoot)
  index = new IndexService(join(dir, 'index.db'))
  search = new SearchService(index.connection)
})

afterEach(async () => {
  index.close()
  await rm(dir, { recursive: true, force: true })
})

function found(query: string): string[] {
  return search.search(query).map((r) => r.path)
}

describe('reconcileIndex', () => {
  it('cold start: indexes an unindexed vault from disk', async () => {
    await vault.writeNote('a.md', 'alpha content')
    await vault.writeNote('b.md', 'bravo content')

    await reconcileIndex(vault, index)

    expect(found('alpha')).toEqual(['a.md'])
    expect(found('bravo')).toEqual(['b.md'])
  })

  it('drops index rows for files deleted while the app was closed', async () => {
    await vault.writeNote('keep.md', 'keep this')
    await vault.writeNote('gone.md', 'remove this')
    await reconcileIndex(vault, index)
    expect(found('remove')).toEqual(['gone.md'])

    // Simulate an external delete, then relaunch reconciliation.
    await vault.deleteNote('gone.md')
    await reconcileIndex(vault, index)

    expect(found('remove')).toEqual([])
    expect(found('keep')).toEqual(['keep.md'])
  })

  it('re-indexes a file whose content changed externally (newer mtime)', async () => {
    await vault.writeNote('note.md', 'original term')
    await reconcileIndex(vault, index)
    expect(found('original')).toEqual(['note.md'])

    // External edit with a strictly newer mtime.
    await new Promise((r) => setTimeout(r, 12))
    await vault.writeNote('note.md', 'replacement term')
    await reconcileIndex(vault, index)

    expect(found('original')).toEqual([])
    expect(found('replacement')).toEqual(['note.md'])
  })

  it('leaves an unchanged file alone (no content re-read needed)', async () => {
    await vault.writeNote('stable.md', 'stable words')
    await reconcileIndex(vault, index)

    // Second pass with no disk changes is a no-op for results.
    await reconcileIndex(vault, index)
    expect(found('stable')).toEqual(['stable.md'])
    expect(index.getIndexed().map((n) => n.path)).toEqual(['stable.md'])
  })

  it('picks up a brand-new file added since the last index', async () => {
    await vault.writeNote('first.md', 'first note')
    await reconcileIndex(vault, index)

    await writeFile(join(vaultRoot, 'second.md'), 'second note')
    await reconcileIndex(vault, index)

    expect(found('second')).toEqual(['second.md'])
  })

  it('syncs tags during reconciliation (content with tags reindexed)', async () => {
    await vault.writeNote('tagged.md', 'Hello #world')
    await reconcileIndex(vault, index)
    expect(index.listTags()).toEqual([{ name: 'world', count: 1 }])
    expect(index.notesForTag('world')).toEqual(['tagged.md'])
  })

  it('updates tags when content changes externally', async () => {
    await vault.writeNote('note.md', '#old-tag content')
    await reconcileIndex(vault, index)
    expect(index.notesForTag('old-tag')).toEqual(['note.md'])

    await new Promise((r) => setTimeout(r, 12))
    await vault.writeNote('note.md', '#new-tag content')
    await reconcileIndex(vault, index)

    expect(index.notesForTag('old-tag')).toEqual([])
    expect(index.notesForTag('new-tag')).toEqual(['note.md'])
  })
})
