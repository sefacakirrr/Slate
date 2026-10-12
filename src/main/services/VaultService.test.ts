import { mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { replaceWithTemp, VaultService } from './VaultService'

// node builtins have non-configurable exports, so vi.spyOn can't replace
// `rename`. Mock the module with a real passthrough that fails only when the
// hoisted flag is set — lets the atomic-write test inject a rename failure
// without disturbing the other writeNote tests.
const renameControl = vi.hoisted(() => ({ shouldFail: false }))
const cpControl = vi.hoisted(() => ({ shouldFail: false }))

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    rename: (...args: Parameters<typeof actual.rename>) => {
      if (renameControl.shouldFail) return Promise.reject(new Error('boom'))
      return actual.rename(...args)
    },
    cp: (...args: Parameters<typeof actual.cp>) => {
      if (cpControl.shouldFail) return Promise.reject(new Error('cp-boom'))
      return actual.cp(...args)
    },
  }
})

let root: string
let vault: VaultService

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'slate-vault-'))
  vault = new VaultService(root)
})

afterEach(async () => {
  vi.restoreAllMocks()
  cpControl.shouldFail = false
  renameControl.shouldFail = false
  await rm(root, { recursive: true, force: true })
})

/** Seeds a representative vault: allowed types, excluded segments, nesting. */
async function seed(): Promise<void> {
  await writeFile(join(root, 'a.md'), 'alpha')
  await writeFile(join(root, 'b.markdown'), 'bravo')
  await writeFile(join(root, 'c.txt'), 'charlie')
  await writeFile(join(root, 'd.png'), 'binary')
  await writeFile(join(root, '.hidden'), 'secret')
  await writeFile(join(root, 'README'), 'no extension')

  await mkdir(join(root, 'sub'))
  await writeFile(join(root, 'sub', 'e.md'), 'echo')
  await writeFile(join(root, 'sub', 'nested.txt'), 'november')

  await mkdir(join(root, '_attachments'))
  await writeFile(join(root, '_attachments', 'x.md'), 'should be hidden')

  await mkdir(join(root, '.git'))
  await writeFile(join(root, '.git', 'config'), 'should be hidden')
}

describe('listNotes', () => {
  it('returns only allowed extensions, walks subfolders, sorted', async () => {
    await seed()
    expect(await vault.listNotes()).toEqual([
      'a.md',
      'b.markdown',
      'c.txt',
      'sub/e.md',
      'sub/nested.txt',
    ])
  })

  it('excludes files under `_` and `.` segments', async () => {
    await seed()
    const notes = await vault.listNotes()
    expect(notes).not.toContain('_attachments/x.md')
    expect(notes.some((p) => p.startsWith('_attachments/'))).toBe(false)
    expect(notes.some((p) => p.includes('.git'))).toBe(false)
    expect(notes).not.toContain('.hidden')
  })

  it('returns an empty list for an empty vault', async () => {
    expect(await vault.listNotes()).toEqual([])
  })
})

describe('listNotesWithMtime', () => {
  it('returns the same paths as listNotes, each with a numeric mtime', async () => {
    await seed()
    const stats = await vault.listNotesWithMtime()
    expect(stats.map((s) => s.path)).toEqual(await vault.listNotes())
    for (const s of stats) {
      expect(Number.isInteger(s.mtime)).toBe(true)
      expect(s.mtime).toBeGreaterThan(0)
    }
  })

  it('applies the same exclusions as listNotes', async () => {
    await seed()
    const paths = (await vault.listNotesWithMtime()).map((s) => s.path)
    expect(paths.some((p) => p.startsWith('_attachments/'))).toBe(false)
    expect(paths.some((p) => p.includes('.git'))).toBe(false)
  })

  it('reflects a newer mtime after a rewrite', async () => {
    await vault.writeNote('m.md', 'first')
    const before = await vault.statMtime('m.md')
    // Push the clock forward so the filesystem records a strictly newer mtime.
    await new Promise((r) => setTimeout(r, 12))
    await vault.writeNote('m.md', 'second')
    const after = await vault.statMtime('m.md')
    expect(after).toBeGreaterThanOrEqual(before)
  })

  it('statMtime throws for a path that escapes the vault', async () => {
    await expect(vault.statMtime('../outside.md')).rejects.toThrow('path-outside-vault')
  })
})

describe('readNote', () => {
  it('reads an existing note as UTF-8', async () => {
    await writeFile(join(root, 'note.md'), 'hello world')
    expect(await vault.readNote('note.md')).toBe('hello world')
  })

  it('throws reading a non-existent note', async () => {
    await expect(vault.readNote('missing.md')).rejects.toThrow()
  })
})

describe('path safety', () => {
  it('rejects parent traversal', async () => {
    await expect(vault.readNote('../outside.md')).rejects.toThrow('path-outside-vault')
  })

  it('rejects an absolute path outside the vault', async () => {
    await expect(vault.readNote(join(tmpdir(), 'elsewhere.md'))).rejects.toThrow(
      'path-outside-vault',
    )
  })

  it('accepts a relative path with a ./ prefix', async () => {
    await writeFile(join(root, 'ok.md'), 'fine')
    expect(await vault.readNote('./ok.md')).toBe('fine')
  })
})

describe('writeNote (atomic)', () => {
  it('writes content that round-trips through readNote', async () => {
    await vault.writeNote('round.md', 'trip')
    expect(await vault.readNote('round.md')).toBe('trip')
  })

  it('overwrites an existing note fully', async () => {
    await writeFile(join(root, 'over.md'), 'old content here')
    await vault.writeNote('over.md', 'new')
    expect(await readFile(join(root, 'over.md'), 'utf-8')).toBe('new')
  })

  it('leaves the canonical file untouched when rename fails', async () => {
    await writeFile(join(root, 'safe.md'), 'original')
    renameControl.shouldFail = true
    try {
      await expect(vault.writeNote('safe.md', 'corrupted')).rejects.toThrow('boom')
    } finally {
      renameControl.shouldFail = false
    }
    expect(await readFile(join(root, 'safe.md'), 'utf-8')).toBe('original')
  })
})

describe('createNote', () => {
  it('creates an empty note on first call', async () => {
    await vault.createNote('fresh.md')
    expect(await vault.readNote('fresh.md')).toBe('')
  })

  it('rejects when the note already exists', async () => {
    await vault.createNote('dup.md')
    await expect(vault.createNote('dup.md')).rejects.toThrow('file-exists')
  })
})

describe('deleteNote', () => {
  it('removes an existing note', async () => {
    await writeFile(join(root, 'gone.md'), 'bye')
    await vault.deleteNote('gone.md')
    await expect(vault.readNote('gone.md')).rejects.toThrow()
  })

  it('tolerates deleting a missing note', async () => {
    await expect(vault.deleteNote('never-existed.md')).resolves.toBeUndefined()
  })
})

describe('renameNote', () => {
  it('renames a note, preserving content; old path is gone', async () => {
    await writeFile(join(root, 'a.md'), 'alpha')
    await vault.renameNote('a.md', 'z.md')
    expect(await vault.readNote('z.md')).toBe('alpha')
    await expect(vault.readNote('a.md')).rejects.toThrow()
  })

  it('can change the extension between allowed note types', async () => {
    await writeFile(join(root, 'a.md'), 'alpha')
    await vault.renameNote('a.md', 'a.txt')
    expect(await vault.readNote('a.txt')).toBe('alpha')
  })

  it('rejects a target without an allowed note extension', async () => {
    await writeFile(join(root, 'a.md'), 'alpha')
    await expect(vault.renameNote('a.md', 'a.png')).rejects.toThrow('invalid-extension')
    // Source is untouched.
    expect(await vault.readNote('a.md')).toBe('alpha')
  })

  it('rejects when the target already exists (no overwrite)', async () => {
    await writeFile(join(root, 'a.md'), 'alpha')
    await writeFile(join(root, 'b.md'), 'bravo')
    await expect(vault.renameNote('a.md', 'b.md')).rejects.toThrow('file-exists')
    expect(await vault.readNote('b.md')).toBe('bravo')
  })

  it('rejects a target that escapes the vault', async () => {
    await writeFile(join(root, 'a.md'), 'alpha')
    await expect(vault.renameNote('a.md', '../escape.md')).rejects.toThrow('path-outside-vault')
  })

  it('moves a note into an existing subfolder', async () => {
    await writeFile(join(root, 'a.md'), 'alpha')
    await mkdir(join(root, 'sub'))
    await vault.renameNote('a.md', 'sub/a.md')
    expect(await vault.readNote('sub/a.md')).toBe('alpha')
  })
})

describe('locked notes (.md.enc)', () => {
  it('lists a locked note alongside plaintext notes', async () => {
    await writeFile(join(root, 'a.md'), 'alpha')
    await writeFile(join(root, 'secret.md.enc'), Buffer.from([1, 2, 3, 4]))
    expect(await vault.listNotes()).toEqual(['a.md', 'secret.md.enc'])
  })

  it('does NOT list a bare .enc without a note extension', async () => {
    await writeFile(join(root, 'blob.enc'), Buffer.from([9, 9]))
    expect(await vault.listNotes()).toEqual([])
  })

  it('derives a locked note title from its filename and a locked snippet — never reads ciphertext', async () => {
    // Non-utf8 bytes: if listNotesDetailed tried to parse these as text for a
    // title/snippet, the result would be garbage. It must not read them.
    await mkdir(join(root, 'sub'), { recursive: true })
    await writeFile(join(root, 'sub', 'diary.md.enc'), Buffer.from([0xff, 0xfe, 0x00, 0x01]))
    const detailed = await vault.listNotesDetailed()
    const locked = detailed.find((d) => d.path === 'sub/diary.md.enc')
    expect(locked).toBeDefined()
    expect(locked?.title).toBe('diary')
    expect(locked?.snippet).toBe('🔒 Locked')
  })

  it('round-trips raw bytes through writeBytes/readBytes atomically', async () => {
    const data = Buffer.from([0x00, 0x10, 0xff, 0x42, 0x7f])
    await vault.writeBytes('note.md.enc', data)
    expect(await vault.readBytes('note.md.enc')).toEqual(data)
  })
})

describe('trash', () => {
  it('moves a note into .trash/<id>/ with meta and hides it from listings', async () => {
    await mkdir(join(root, 'sub'))
    await writeFile(join(root, 'sub', 'n.md'), 'note body')
    const item = await vault.moveToTrash('sub/n.md', 'note')

    expect(item).toMatchObject({ kind: 'note', name: 'n.md', originalPath: 'sub/n.md' })
    expect(await readFile(join(root, '.trash', item.id, 'n.md'), 'utf-8')).toBe('note body')
    const meta = JSON.parse(await readFile(join(root, '.trash', item.id, 'meta.json'), 'utf-8'))
    expect(meta).toEqual(item)

    // Walkers never see the trash.
    expect(await vault.listNotes()).toEqual([])
    expect((await vault.listNotesWithMtime()).map((n) => n.path)).toEqual([])
    expect(await vault.listNotesDetailed()).toEqual([])
    expect(await vault.listDirs()).toEqual(['sub'])
  })

  it('moves a folder (with a locked note) and hides its dirs', async () => {
    await mkdir(join(root, 'f', 'deep'), { recursive: true })
    await writeFile(join(root, 'f', 'a.md'), 'a')
    await writeFile(join(root, 'f', 'deep', 's.md.enc'), 'cipher')
    const item = await vault.moveToTrash('f', 'folder')

    expect(item.kind).toBe('folder')
    expect(await readFile(join(root, '.trash', item.id, 'f', 'deep', 's.md.enc'), 'utf-8')).toBe(
      'cipher',
    )
    expect(await vault.listNotes()).toEqual([])
    expect(await vault.listDirs()).toEqual([])
  })

  it('rejects trashing the vault root, the trash itself, or a missing path', async () => {
    await expect(vault.moveToTrash('', 'folder')).rejects.toThrow('invalid-path')
    await expect(vault.moveToTrash('.trash', 'folder')).rejects.toThrow('invalid-path')
    await expect(vault.moveToTrash('nope.md', 'note')).rejects.toThrow('not-found')
    await expect(vault.moveToTrash('../x.md', 'note')).rejects.toThrow('path-outside-vault')
  })

  it('lists items newest first', async () => {
    await writeFile(join(root, 'a.md'), 'a')
    await writeFile(join(root, 'b.md'), 'b')
    const first = await vault.moveToTrash('a.md', 'note')
    await new Promise((r) => setTimeout(r, 5))
    const second = await vault.moveToTrash('b.md', 'note')
    expect((await vault.listTrash()).map((i) => i.id)).toEqual([second.id, first.id])
  })

  it('restores to the original path and recreates missing parents', async () => {
    await mkdir(join(root, 'p', 'q'), { recursive: true })
    await writeFile(join(root, 'p', 'q', 'n.md'), 'body')
    const item = await vault.moveToTrash('p', 'folder')
    expect(await vault.listDirs()).toEqual([])

    const restored = await vault.restoreFromTrash(item.id)
    expect(restored).toEqual({ path: 'p', kind: 'folder', notes: ['p/q/n.md'] })
    expect(await vault.readNote('p/q/n.md')).toBe('body')
    expect(await vault.listTrash()).toEqual([])
  })

  it('recreates a deleted parent folder when restoring a note', async () => {
    await mkdir(join(root, 'gone'))
    await writeFile(join(root, 'gone', 'n.md'), 'body')
    const item = await vault.moveToTrash('gone/n.md', 'note')
    await rm(join(root, 'gone'), { recursive: true })

    const restored = await vault.restoreFromTrash(item.id)
    expect(restored.path).toBe('gone/n.md')
    expect(await vault.readNote('gone/n.md')).toBe('body')
  })

  it('appends " (restored)" then a counter on name collision, keeping .md.enc', async () => {
    await writeFile(join(root, 'n.md'), 'old')
    const a = await vault.moveToTrash('n.md', 'note')
    await writeFile(join(root, 'n.md'), 'new')
    expect((await vault.restoreFromTrash(a.id)).path).toBe('n (restored).md')

    await writeFile(join(root, 'x.md'), 'x1')
    const b = await vault.moveToTrash('x.md', 'note')
    await writeFile(join(root, 'x.md'), 'x2')
    await writeFile(join(root, 'x (restored).md'), 'x3')
    expect((await vault.restoreFromTrash(b.id)).path).toBe('x (restored 2).md')

    await writeFile(join(root, 's.md.enc'), 'c1')
    const c = await vault.moveToTrash('s.md.enc', 'note')
    await writeFile(join(root, 's.md.enc'), 'c2')
    const restored = await vault.restoreFromTrash(c.id)
    expect(restored.path).toBe('s (restored).md.enc')
    expect(restored.notes).toEqual(['s (restored).md.enc'])

    await mkdir(join(root, 'dir'))
    const d = await vault.moveToTrash('dir', 'folder')
    await mkdir(join(root, 'dir'))
    expect((await vault.restoreFromTrash(d.id)).path).toBe('dir (restored)')
  })

  it('rejects malformed trash ids (no traversal)', async () => {
    await expect(vault.restoreFromTrash('../x')).rejects.toThrow('invalid-trash-id')
    await expect(vault.deleteTrashItem('..')).rejects.toThrow('invalid-trash-id')
  })

  it('deleteTrashItem / emptyTrash hand item dirs to the remover', async () => {
    await writeFile(join(root, 'a.md'), 'a')
    await writeFile(join(root, 'b.md'), 'b')
    const a = await vault.moveToTrash('a.md', 'note')
    await vault.moveToTrash('b.md', 'note')

    const removed: string[] = []
    const remover = async (abs: string) => {
      removed.push(abs)
      await rm(abs, { recursive: true, force: true })
    }
    await vault.deleteTrashItem(a.id, remover)
    expect(removed).toEqual([join(root, '.trash', a.id)])
    expect((await vault.listTrash()).length).toBe(1)

    expect(await vault.emptyTrash(remover)).toBe(1)
    expect(await vault.listTrash()).toEqual([])
  })

  it('purges only items older than the cutoff', async () => {
    await writeFile(join(root, 'old.md'), 'o')
    await writeFile(join(root, 'new.md'), 'n')
    const old = await vault.moveToTrash('old.md', 'note')
    const fresh = await vault.moveToTrash('new.md', 'note')
    // Backdate the old item's meta by 31 days.
    const metaPath = join(root, '.trash', old.id, 'meta.json')
    const deletedAt = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString()
    await writeFile(metaPath, JSON.stringify({ ...old, deletedAt }))

    expect(await vault.purgeTrash(30 * 24 * 60 * 60 * 1000)).toBe(1)
    expect((await vault.listTrash()).map((i) => i.id)).toEqual([fresh.id])
  })
})

describe('trash with the OS recycle bin', () => {
  let bin: string
  let recycled: string[]
  /** Fake OS trash: moves the path into a bin dir outside the vault. */
  const fakeOsTrash = async (abs: string) => {
    recycled.push(abs)
    await rename(abs, join(bin, `${recycled.length}-${basename(abs)}`))
  }
  const exists = (p: string) =>
    stat(p).then(
      () => true,
      () => false,
    )

  beforeEach(async () => {
    bin = await mkdtemp(join(tmpdir(), 'slate-bin-'))
    recycled = []
  })
  afterEach(async () => {
    await rm(bin, { recursive: true, force: true })
  })

  it('copies a note into .trash and sends the original to the OS trash', async () => {
    await mkdir(join(root, 'sub'))
    await writeFile(join(root, 'sub', 'n.md'), 'note body')
    const item = await vault.moveToTrash('sub/n.md', 'note', fakeOsTrash)

    expect(item).toMatchObject({ kind: 'note', name: 'n.md', originalPath: 'sub/n.md' })
    expect(item.osTrashed).toBe(true)
    expect(recycled).toEqual([join(root, 'sub', 'n.md')])
    expect(await exists(join(root, 'sub', 'n.md'))).toBe(false)
    expect(await readFile(join(bin, '1-n.md'), 'utf-8')).toBe('note body')
    expect(await readFile(join(root, '.trash', item.id, 'n.md'), 'utf-8')).toBe('note body')
    const meta = JSON.parse(await readFile(join(root, '.trash', item.id, 'meta.json'), 'utf-8'))
    expect(meta).toEqual(item)
    expect(await vault.listTrash()).toEqual([item])
  })

  it('copies a folder with nested + locked notes, and restores all of it', async () => {
    await mkdir(join(root, 'f', 'deep'), { recursive: true })
    await writeFile(join(root, 'f', 'a.md'), 'a')
    await writeFile(join(root, 'f', 'deep', 'b.md'), 'b')
    await writeFile(join(root, 'f', 'deep', 's.md.enc'), 'cipher')
    const item = await vault.moveToTrash('f', 'folder', fakeOsTrash)

    expect(item.osTrashed).toBe(true)
    expect(await exists(join(root, 'f'))).toBe(false)
    expect(await readFile(join(bin, '1-f', 'deep', 's.md.enc'), 'utf-8')).toBe('cipher')
    expect(await vault.listNotes()).toEqual([])

    const restored = await vault.restoreFromTrash(item.id)
    expect(restored.path).toBe('f')
    expect(restored.notes.sort()).toEqual(['f/a.md', 'f/deep/b.md', 'f/deep/s.md.enc'])
    expect(await readFile(join(root, 'f', 'deep', 's.md.enc'), 'utf-8')).toBe('cipher')
    expect(await vault.listTrash()).toEqual([])
  })

  it('aborts without touching the original when the copy fails', async () => {
    await writeFile(join(root, 'n.md'), 'keep me')
    cpControl.shouldFail = true
    await expect(vault.moveToTrash('n.md', 'note', fakeOsTrash)).rejects.toThrow('cp-boom')

    expect(recycled).toEqual([])
    expect(await readFile(join(root, 'n.md'), 'utf-8')).toBe('keep me')
    expect(await vault.listTrash()).toEqual([])
  })

  it('falls back to moving the original into .trash when the OS trash fails', async () => {
    await writeFile(join(root, 'n.md'), 'body')
    const failing = vi.fn(async () => {
      throw new Error('no recycle bin')
    })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const item = await vault.moveToTrash('n.md', 'note', failing)

    expect(failing).toHaveBeenCalledOnce()
    expect(item.osTrashed).toBeUndefined()
    expect(await exists(join(root, 'n.md'))).toBe(false)
    expect(await readFile(join(root, '.trash', item.id, 'n.md'), 'utf-8')).toBe('body')
    expect((await vault.restoreFromTrash(item.id)).path).toBe('n.md')
    expect(await readFile(join(root, 'n.md'), 'utf-8')).toBe('body')
  })

  it('removes OS-trashed copies with rm, never a second time into the OS trash', async () => {
    await writeFile(join(root, 'a.md'), 'a')
    await writeFile(join(root, 'b.md'), 'b')
    await writeFile(join(root, 'c.md'), 'c')
    const a = await vault.moveToTrash('a.md', 'note', fakeOsTrash)
    await vault.moveToTrash('b.md', 'note', fakeOsTrash)
    // A legacy/fallback item: the .trash entry is the only copy.
    const c = await vault.moveToTrash('c.md', 'note')
    recycled = []

    await vault.deleteTrashItem(a.id, fakeOsTrash)
    expect(recycled).toEqual([])
    expect(await exists(join(root, '.trash', a.id))).toBe(false)

    expect(await vault.emptyTrash(fakeOsTrash)).toBe(2)
    // Only the only-copy item went to the OS trash.
    expect(recycled).toEqual([join(root, '.trash', c.id)])
    expect(await vault.listTrash()).toEqual([])
  })

  it('purges old OS-trashed copies with rm', async () => {
    await writeFile(join(root, 'old.md'), 'o')
    const old = await vault.moveToTrash('old.md', 'note', fakeOsTrash)
    const metaPath = join(root, '.trash', old.id, 'meta.json')
    const deletedAt = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString()
    await writeFile(metaPath, JSON.stringify({ ...old, deletedAt }))
    recycled = []

    expect(await vault.purgeTrash(30 * 24 * 60 * 60 * 1000, fakeOsTrash)).toBe(1)
    expect(recycled).toEqual([])
    expect(await vault.listTrash()).toEqual([])
  })
})

describe('name validation and case-only renames', () => {
  it('rejects names Windows cannot store (no ADS, no device names)', async () => {
    for (const bad of ['ab:c.md', 'q?.md', 'CON.md', 'dir/nul.txt', 'trail.md ', 'x|y.md']) {
      await expect(vault.createNote(bad)).rejects.toThrow('invalid-name')
    }
    await expect(vault.createFolder('bad<dir')).rejects.toThrow('invalid-name')
    await writeFile(join(root, 'ok.md'), 'x')
    await expect(vault.renameNote('ok.md', 'ok:k.md')).rejects.toThrow('invalid-name')
  })

  it('accepts Turkish characters and spaces', async () => {
    await vault.createNote('Çalışma Notları/İç Not ğüş.md')
    expect(await vault.listNotes()).toContain('Çalışma Notları/İç Not ğüş.md')
  })

  it('allows a case-only rename but still refuses a real clash', async () => {
    await writeFile(join(root, 'note.md'), 'n')
    await vault.renameNote('note.md', 'Note.md')
    expect(await vault.listNotes()).toEqual(['Note.md'])
    await writeFile(join(root, 'other.md'), 'o')
    await expect(vault.renameNote('other.md', 'Note.md')).rejects.toThrow('file-exists')
  })
})

describe('replaceWithTemp (Windows transient locks)', () => {
  const errno = (code: string) => Object.assign(new Error(code), { code })

  it('retries EPERM/EBUSY until the destination is released', async () => {
    const failures = [errno('EPERM'), errno('EBUSY')]
    const calls: string[][] = []
    const sleeps: number[] = []
    await replaceWithTemp('t.tmp', 'd.md', {
      rename: (async (a: string, b: string) => {
        calls.push([a, b])
        const f = failures.shift()
        if (f) throw f
      }) as never,
      sleep: async (ms) => {
        sleeps.push(ms)
      },
    })
    expect(calls).toHaveLength(3)
    expect(sleeps).toHaveLength(2)
  })

  it('gives up after the retries and removes the temp file', async () => {
    const tmp = join(root, 'x.tmp')
    await writeFile(tmp, 'data')
    await expect(
      replaceWithTemp(tmp, join(root, 'x.md'), {
        rename: (async () => {
          throw errno('EPERM')
        }) as never,
        sleep: async () => undefined,
      }),
    ).rejects.toThrow('EPERM')
    await expect(stat(tmp)).rejects.toThrow()
  })

  it('does not retry other errors', async () => {
    let n = 0
    await expect(
      replaceWithTemp('a', 'b', {
        rename: (async () => {
          n++
          throw errno('ENOENT')
        }) as never,
        sleep: async () => undefined,
      }),
    ).rejects.toThrow('ENOENT')
    expect(n).toBe(1)
  })
})

describe('renameFolder', () => {
  it('renames a folder with its notes, including a case-only rename', async () => {
    await mkdir(join(root, 'box'))
    await writeFile(join(root, 'box', 'n.md'), 'n')
    await vault.renameFolder('box', 'Crate')
    expect(await vault.listNotes()).toEqual(['Crate/n.md'])
    await vault.renameFolder('Crate', 'crate')
    expect(await vault.listNotes()).toEqual(['crate/n.md'])
  })

  it('rejects an invalid name and an existing target', async () => {
    await mkdir(join(root, 'a'))
    await mkdir(join(root, 'b'))
    await expect(vault.renameFolder('a', 'a|b')).rejects.toThrow('invalid-name')
    await expect(vault.renameFolder('a', 'b')).rejects.toThrow('folder-exists')
  })
})
