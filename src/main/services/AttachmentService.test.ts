import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AttachmentService } from './AttachmentService'

let root: string
let service: AttachmentService

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'slate-attach-'))
  service = new AttachmentService(() => root)
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

function hash(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex')
}

describe('store', () => {
  it('writes a file to _attachments/<hash>.<ext>', async () => {
    const buf = Buffer.from('hello attachment')
    const result = await service.store(buf, 'photo.png')

    const expectedHash = hash(buf)
    expect(result.hash).toBe(expectedHash)
    expect(result.relativePath).toBe(`_attachments/${expectedHash}.png`)

    const written = await readFile(join(root, '_attachments', `${expectedHash}.png`))
    expect(written.equals(buf)).toBe(true)
  })

  it('preserves binary content exactly', async () => {
    const buf = Buffer.alloc(256)
    for (let i = 0; i < 256; i++) buf[i] = i
    const result = await service.store(buf, 'data.bin')

    const written = await readFile(join(root, '_attachments', `${result.hash}.bin`))
    expect(written.equals(buf)).toBe(true)
  })

  it('creates _attachments/ directory on first call', async () => {
    const buf = Buffer.from('first')
    await service.store(buf, 'test.txt')

    const dirStat = await stat(join(root, '_attachments'))
    expect(dirStat.isDirectory()).toBe(true)
  })
})

describe('deduplication', () => {
  it('returns same path for same content without writing twice', async () => {
    const buf = Buffer.from('duplicate content')
    const first = await service.store(buf, 'a.png')
    const second = await service.store(buf, 'b.png')

    expect(first.relativePath).toBe(second.relativePath)
    expect(first.hash).toBe(second.hash)
  })

  it('stores different content as separate files', async () => {
    const buf1 = Buffer.from('content one')
    const buf2 = Buffer.from('content two')
    const r1 = await service.store(buf1, 'a.png')
    const r2 = await service.store(buf2, 'b.png')

    expect(r1.relativePath).not.toBe(r2.relativePath)
  })
})

describe('file size validation', () => {
  it('rejects files larger than 10MB', async () => {
    const buf = Buffer.alloc(10 * 1024 * 1024 + 1)
    await expect(service.store(buf, 'huge.png')).rejects.toThrow('file-too-large')
  })

  it('accepts files exactly 10MB', async () => {
    const buf = Buffer.alloc(10 * 1024 * 1024, 'x')
    const result = await service.store(buf, 'max.png')
    expect(result.relativePath).toContain('_attachments/')
  })

  it('rejects empty files', async () => {
    const buf = Buffer.alloc(0)
    await expect(service.store(buf, 'empty.png')).rejects.toThrow('empty-file')
  })
})

describe('extension extraction', () => {
  it('extracts .png from photo.png', async () => {
    const buf = Buffer.from('img')
    const result = await service.store(buf, 'photo.png')
    expect(result.relativePath).toMatch(/\.png$/)
  })

  it('extracts .tar.gz last extension only', async () => {
    const buf = Buffer.from('archive')
    const result = await service.store(buf, 'backup.tar.gz')
    expect(result.relativePath).toMatch(/\.gz$/)
  })

  it('lowercases extensions', async () => {
    const buf = Buffer.from('upper')
    const result = await service.store(buf, 'Photo.PNG')
    expect(result.relativePath).toMatch(/\.png$/)
  })

  it('uses .bin for files without extension', async () => {
    const buf = Buffer.from('noext')
    const result = await service.store(buf, 'Makefile')
    expect(result.relativePath).toMatch(/\.bin$/)
  })

  it('uses .bin for empty filename', async () => {
    const buf = Buffer.from('unnamed')
    const result = await service.store(buf, '')
    expect(result.relativePath).toMatch(/\.bin$/)
  })
})

describe('error handling', () => {
  it('throws when no vault is configured', async () => {
    const noVault = new AttachmentService(() => null)
    const buf = Buffer.from('test')
    await expect(noVault.store(buf, 'test.png')).rejects.toThrow('no-vault')
  })
})
