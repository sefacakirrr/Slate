import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VaultService } from './VaultService'

// node builtins have non-configurable exports, so vi.spyOn can't replace
// `rename`. Mock the module with a real passthrough that fails only when the
// hoisted flag is set — lets the atomic-write test inject a rename failure
// without disturbing the other writeNote tests.
const renameControl = vi.hoisted(() => ({ shouldFail: false }))

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    rename: (...args: Parameters<typeof actual.rename>) => {
      if (renameControl.shouldFail) return Promise.reject(new Error('boom'))
      return actual.rename(...args)
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
