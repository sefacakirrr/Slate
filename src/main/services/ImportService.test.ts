import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ImportService } from './ImportService'
import { VaultService } from './VaultService'

let vaultRoot: string
let sourceRoot: string
let vault: VaultService
let importer: ImportService

beforeEach(async () => {
  vaultRoot = await mkdtemp(join(tmpdir(), 'slate-import-vault-'))
  sourceRoot = await mkdtemp(join(tmpdir(), 'slate-import-src-'))
  vault = new VaultService(vaultRoot)
  importer = new ImportService(vault)
})

afterEach(async () => {
  await rm(vaultRoot, { recursive: true, force: true })
  await rm(sourceRoot, { recursive: true, force: true })
})

describe('scan', () => {
  it('counts known formats recursively', async () => {
    await writeFile(join(sourceRoot, 'a.md'), '# a')
    await writeFile(join(sourceRoot, 'b.txt'), 'b')
    await mkdir(join(sourceRoot, 'sub'))
    await writeFile(join(sourceRoot, 'sub', 'c.html'), '<p>c</p>')
    await writeFile(join(sourceRoot, 'd.rtf'), '{\\rtf1 hi}')
    await writeFile(join(sourceRoot, 'skip.pdf'), 'binary')

    const scan = await importer.scan(sourceRoot)
    expect(scan.kind).toBe('folder')
    expect(scan.counts).toEqual({ md: 1, txt: 1, html: 1, rtf: 1, text: 0 })
    expect(scan.total).toBe(4)
  })

  it('accepts unknown-extension and extension-less files when they are text', async () => {
    await writeFile(join(sourceRoot, 'script.py'), 'print("hi")')
    await writeFile(join(sourceRoot, 'TODO'), 'buy milk')
    await writeFile(join(sourceRoot, 'binary.unknownext'), Buffer.from([0, 1, 2, 0, 255, 0, 3]))

    const scan = await importer.scan(sourceRoot)
    expect(scan.counts.text).toBe(2)
    expect(scan.total).toBe(2)
  })

  it('skips hidden and underscore directories', async () => {
    await mkdir(join(sourceRoot, '.git'))
    await writeFile(join(sourceRoot, '.git', 'x.md'), 'x')
    await mkdir(join(sourceRoot, '_private'))
    await writeFile(join(sourceRoot, '_private', 'y.md'), 'y')
    await writeFile(join(sourceRoot, 'real.md'), 'real')

    const scan = await importer.scan(sourceRoot)
    expect(scan.total).toBe(1)
  })

  it('rejects a non-zip file source', async () => {
    const file = join(sourceRoot, 'notes.docx')
    await writeFile(file, 'x')
    await expect(importer.scan(file)).rejects.toThrow('unsupported-source')
  })
})

describe('execute', () => {
  it('imports a txt+md folder into Imported/<source>/ and never touches originals', async () => {
    await writeFile(join(sourceRoot, 'one.txt'), 'plain text')
    await writeFile(join(sourceRoot, 'two.md'), '# two')

    const result = await importer.execute({
      sourcePath: sourceRoot,
      destination: 'imported-subfolder',
    })

    expect(result.imported).toBe(2)
    expect(result.skipped).toBe(0)
    const notes = await vault.listNotes()
    expect(notes).toHaveLength(2)
    expect(notes.every((p) => p.startsWith(result.targetFolder + '/'))).toBe(true)
    expect(notes.some((p) => p.endsWith('one.md'))).toBe(true)
    // Originals intact.
    expect(await readFile(join(sourceRoot, 'one.txt'), 'utf-8')).toBe('plain text')
  })

  it('imports into the vault root when destination is root', async () => {
    await writeFile(join(sourceRoot, 'note.md'), 'x')
    const result = await importer.execute({ sourcePath: sourceRoot, destination: 'root' })
    expect(result.targetFolder).toBe('')
    expect(await vault.listNotes()).toEqual(['note.md'])
  })

  it('suffixes conflicting filenames instead of overwriting', async () => {
    await vault.writeNote('note.md', 'EXISTING')
    await writeFile(join(sourceRoot, 'note.md'), 'IMPORTED')

    const result = await importer.execute({ sourcePath: sourceRoot, destination: 'root' })
    expect(result.imported).toBe(1)
    expect(await vault.readNote('note.md')).toBe('EXISTING')
    expect(await vault.readNote('note-1.md')).toBe('IMPORTED')
  })

  it('reports per-note progress ending in a completion event', async () => {
    await writeFile(join(sourceRoot, 'a.md'), 'a')
    await writeFile(join(sourceRoot, 'b.md'), 'b')

    const events: { done: number; total: number }[] = []
    await importer.execute({ sourcePath: sourceRoot, destination: 'root' }, (p) =>
      events.push({ done: p.done, total: p.total }),
    )
    expect(events[0]).toEqual({ done: 0, total: 2 })
    expect(events[events.length - 1]).toEqual({ done: 2, total: 2 })
  })

  it('converts html files to markdown notes', async () => {
    await writeFile(join(sourceRoot, 'page.html'), '<h1>Hi</h1><p>Body <b>bold</b></p>')
    await importer.execute({ sourcePath: sourceRoot, destination: 'root' })
    const content = await vault.readNote('page.md')
    expect(content).toContain('# Hi')
    expect(content).toContain('**bold**')
  })

  it('preserves the source folder structure in the vault', async () => {
    await mkdir(join(sourceRoot, 'work', 'projects'), { recursive: true })
    await writeFile(join(sourceRoot, 'root.md'), 'root')
    await writeFile(join(sourceRoot, 'work', 'notes.txt'), 'work notes')
    await writeFile(join(sourceRoot, 'work', 'projects', 'plan.md'), 'plan')

    const result = await importer.execute({
      sourcePath: sourceRoot,
      destination: 'imported-subfolder',
    })
    const notes = await vault.listNotes()
    const t = result.targetFolder
    expect(notes).toContain(`${t}/root.md`)
    expect(notes).toContain(`${t}/work/notes.md`)
    expect(notes).toContain(`${t}/work/projects/plan.md`)
  })

  it('imports code and extension-less files as .md-suffixed notes', async () => {
    await writeFile(join(sourceRoot, 'script.py'), 'print("hi")')
    await writeFile(join(sourceRoot, 'TODO'), 'buy milk')

    await importer.execute({ sourcePath: sourceRoot, destination: 'root' })
    expect(await vault.readNote('script.py.md')).toBe('print("hi")')
    expect(await vault.readNote('TODO.md')).toBe('buy milk')
  })

  it('converts rtf files to plain-text notes', async () => {
    const rtf =
      '{\\rtf1\\ansi{\\fonttbl{\\f0 Helvetica;}}\\f0\\fs24 Hello \\b bold\\b0  world\\par second line}'
    await writeFile(join(sourceRoot, 'note.rtf'), rtf)
    await importer.execute({ sourcePath: sourceRoot, destination: 'root' })
    const content = await vault.readNote('note.md')
    expect(content).toContain('Hello bold world')
    expect(content).toContain('second line')
    expect(content).not.toContain('Helvetica')
  })

  it('skips binary files without importing them', async () => {
    await writeFile(join(sourceRoot, 'photo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]))
    await writeFile(join(sourceRoot, 'real.md'), 'x')
    const result = await importer.execute({ sourcePath: sourceRoot, destination: 'root' })
    expect(result.imported).toBe(1)
    expect(await vault.listNotes()).toEqual(['real.md'])
  })
})

describe('encoding detection', () => {
  it('reads UTF-16 LE files (Windows Notepad exports)', async () => {
    await writeFile(join(sourceRoot, 'win.txt'), Buffer.from('﻿Türkçe içerik', 'utf16le'))
    await importer.execute({ sourcePath: sourceRoot, destination: 'root' })
    expect(await vault.readNote('win.md')).toBe('Türkçe içerik')
  })

  it('falls back to Latin-1 for non-UTF-8 bytes', async () => {
    // 0xE9 = é in Latin-1; invalid as a standalone UTF-8 byte.
    await writeFile(join(sourceRoot, 'legacy.txt'), Buffer.from([0x63, 0x61, 0x66, 0xe9]))
    await importer.execute({ sourcePath: sourceRoot, destination: 'root' })
    expect(await vault.readNote('legacy.md')).toBe('café')
  })

  it('strips a UTF-8 BOM', async () => {
    await writeFile(join(sourceRoot, 'bom.txt'), Buffer.from('﻿hello', 'utf-8'))
    await importer.execute({ sourcePath: sourceRoot, destination: 'root' })
    expect(await vault.readNote('bom.md')).toBe('hello')
  })
})
