import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  decodeText,
  ExternalFileService,
  encodeText,
  MAX_EXTERNAL_FILE_BYTES,
  parseOpenPaths,
  vaultRelativePath,
} from './ExternalFileService'

describe('parseOpenPaths', () => {
  it('skips the executable and flags, keeps openable files (packaged)', () => {
    const argv = ['C:\\Apps\\Slate\\Slate.exe', '--hidden', 'C:\\Notes\\a.md', 'C:\\x\\b.TXT']
    expect(parseOpenPaths(argv, { cwd: 'C:\\', skip: 1, platform: 'win32' })).toEqual([
      'C:\\Notes\\a.md',
      'C:\\x\\b.TXT',
    ])
  })

  it('skips the app path in dev and ignores non-text arguments', () => {
    const argv = ['C:\\e\\electron.exe', '.', '--inspect=5858', 'C:\\n\\c.markdown', 'C:\\n\\d.png']
    expect(parseOpenPaths(argv, { cwd: 'C:\\', skip: 2, platform: 'win32' })).toEqual([
      'C:\\n\\c.markdown',
    ])
  })

  it('resolves relative paths against the working directory', () => {
    expect(
      parseOpenPaths(['slate', 'notes/a.md'], { cwd: '/home/me', skip: 1, platform: 'linux' }),
    ).toEqual(['/home/me/notes/a.md'])
    expect(
      parseOpenPaths(['Slate.exe', 'a.md'], { cwd: 'D:\\work', skip: 1, platform: 'win32' }),
    ).toEqual(['D:\\work\\a.md'])
  })

  it('dedupes case-insensitively on Windows only', () => {
    const win = parseOpenPaths(['x', 'C:\\A.md', 'c:\\a.MD'], {
      cwd: 'C:\\',
      skip: 1,
      platform: 'win32',
    })
    expect(win).toEqual(['C:\\A.md'])
    const posix = parseOpenPaths(['x', '/A.md', '/a.md'], { cwd: '/', skip: 1, platform: 'darwin' })
    expect(posix).toEqual(['/A.md', '/a.md'])
  })

  it('returns nothing for a plain launch', () => {
    expect(parseOpenPaths(['Slate.exe'], { cwd: 'C:\\', skip: 1, platform: 'win32' })).toEqual([])
    expect(
      parseOpenPaths(['Slate.exe', '--hidden'], { cwd: 'C:\\', skip: 1, platform: 'win32' }),
    ).toEqual([])
  })
})

describe('vaultRelativePath', () => {
  it('maps a path inside the vault to a forward-slash relative path', () => {
    expect(vaultRelativePath('C:\\Vault\\notes\\a.md', 'C:\\Vault', 'win32')).toBe('notes/a.md')
    expect(vaultRelativePath('/Users/me/Vault/a.md', '/Users/me/Vault', 'darwin')).toBe('a.md')
  })

  it('is case-insensitive on Windows', () => {
    expect(vaultRelativePath('c:\\vault\\Notes\\A.md', 'C:\\Vault', 'win32')).toBe('Notes/A.md')
    expect(vaultRelativePath('C:\\VAULT\\a.md', 'c:\\vault\\', 'win32')).toBe('a.md')
  })

  it('is case-sensitive on POSIX', () => {
    expect(vaultRelativePath('/users/me/vault/a.md', '/Users/me/Vault', 'linux')).toBeNull()
  })

  it('treats a different drive as outside', () => {
    expect(vaultRelativePath('D:\\Vault\\a.md', 'C:\\Vault', 'win32')).toBeNull()
  })

  it('rejects .. traversal and sibling-prefix folders', () => {
    expect(vaultRelativePath('C:\\Vault\\..\\secret.md', 'C:\\Vault', 'win32')).toBeNull()
    expect(vaultRelativePath('C:\\Vault2\\a.md', 'C:\\Vault', 'win32')).toBeNull()
    expect(vaultRelativePath('/v/../etc/a.md', '/v', 'linux')).toBeNull()
    // `..` that stays inside the vault is fine.
    expect(vaultRelativePath('C:\\Vault\\x\\..\\a.md', 'C:\\Vault', 'win32')).toBe('a.md')
  })

  it('treats hidden/underscored parts of the vault (trash, attachments) as outside', () => {
    expect(vaultRelativePath('C:\\Vault\\.trash\\1-ab\\a.md', 'C:\\Vault', 'win32')).toBeNull()
    expect(vaultRelativePath('C:\\Vault\\_attachments\\a.txt', 'C:\\Vault', 'win32')).toBeNull()
  })

  it('returns null for the vault root itself', () => {
    expect(vaultRelativePath('C:\\Vault', 'C:\\Vault', 'win32')).toBeNull()
  })
})

describe('decodeText / encodeText', () => {
  const roundTrip = (bytes: Buffer) => {
    const { content, format } = decodeText(bytes)
    return { content, format, out: encodeText(content, format) }
  }

  it('strips a UTF-8 BOM for display and restores it on save', () => {
    const bytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('# Héllo\n')])
    const { content, format, out } = roundTrip(bytes)
    expect(content).toBe('# Héllo\n')
    expect(format.bom).toBe(true)
    expect(out.equals(bytes)).toBe(true)
  })

  it('normalizes CRLF to LF for the editor and restores CRLF on save', () => {
    const bytes = Buffer.from('a\r\nb\r\n\r\nc')
    const { content, format, out } = roundTrip(bytes)
    expect(content).toBe('a\nb\n\nc')
    expect(format.eol).toBe('\r\n')
    expect(out.equals(bytes)).toBe(true)
  })

  it('keeps LF files LF and BOM-less', () => {
    const bytes = Buffer.from('a\nb\n')
    const { format, out } = roundTrip(bytes)
    expect(format).toEqual({ bom: false, eol: '\n' })
    expect(out.equals(bytes)).toBe(true)
  })

  it('applies the original line endings to edited content', () => {
    const { format } = decodeText(Buffer.from('x\r\ny'))
    expect(encodeText('x\nnew line\ny\n', format).toString()).toBe('x\r\nnew line\r\ny\r\n')
  })

  it('rejects binary (NUL bytes) and non-UTF-8 content', () => {
    expect(() => decodeText(Buffer.from([0x61, 0x00, 0x62]))).toThrow('binary-file')
    expect(() => decodeText(Buffer.from([0x61, 0xff, 0xfe, 0x62]))).toThrow('unsupported-encoding')
  })
})

describe('ExternalFileService', () => {
  let dir: string
  let vault: string
  let outside: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'slate-external-'))
    vault = join(dir, 'Vault')
    outside = join(dir, 'Outside')
    await mkdir(join(vault, 'notes'), { recursive: true })
    await mkdir(outside, { recursive: true })
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('refuses to read or write a path that was never opened', async () => {
    const file = join(outside, 'secret.md')
    await writeFile(file, 'secret')
    const svc = new ExternalFileService()
    await expect(svc.read(file)).rejects.toThrow('not-allowed')
    await expect(svc.write(file, 'pwned')).rejects.toThrow('not-allowed')
    await expect(svc.read('relative.md')).rejects.toThrow('not-allowed')
    expect(await readFile(file, 'utf-8')).toBe('secret')
  })

  it('resolves outside files as external (allowlisted) and vault files as vault tabs', async () => {
    const ext = join(outside, 'a.md')
    const inVault = join(vault, 'notes', 'b.txt')
    await writeFile(ext, 'A')
    await writeFile(inVault, 'B')
    const svc = new ExternalFileService()
    const reqs = await svc.resolveOpen([ext, inVault], vault)
    expect(reqs).toEqual([
      { kind: 'external', path: ext },
      { kind: 'vault', path: 'notes/b.txt' },
    ])
    expect(svc.isAllowed(ext)).toBe(true)
    // A vault file stays on the vault path, not the external allowlist.
    expect(svc.isAllowed(inVault)).toBe(false)
    expect(await svc.read(ext)).toBe('A')
  })

  it('opens everything as external when no vault is configured', async () => {
    const file = join(vault, 'notes', 'c.md')
    await writeFile(file, 'C')
    const svc = new ExternalFileService()
    expect(await svc.resolveOpen([file], null)).toEqual([{ kind: 'external', path: file }])
  })

  it('reports missing, oversized, binary and unsupported files without allowlisting them', async () => {
    const big = join(outside, 'big.txt')
    const bin = join(outside, 'bin.md')
    const img = join(outside, 'pic.png')
    await writeFile(big, Buffer.alloc(MAX_EXTERNAL_FILE_BYTES + 1, 0x61))
    await writeFile(bin, Buffer.from([0x23, 0x00, 0x01]))
    await writeFile(img, 'x')
    const missing = join(outside, 'gone.md')
    const svc = new ExternalFileService()
    const reqs = await svc.resolveOpen([missing, big, bin, img], vault)
    expect(reqs).toEqual([
      { kind: 'error', path: missing, error: 'not-found' },
      { kind: 'error', path: big, error: 'too-large' },
      { kind: 'error', path: bin, error: 'binary-file' },
      { kind: 'error', path: img, error: 'unsupported-type' },
    ])
    for (const p of [missing, big, bin, img]) expect(svc.isAllowed(p)).toBe(false)
  })

  it('ignores relative paths handed to resolveOpen', async () => {
    const svc = new ExternalFileService()
    expect(await svc.resolveOpen(['a.md', ''], vault)).toEqual([])
  })

  it('writes in place preserving BOM and CRLF', async () => {
    const file = join(outside, 'win.txt')
    const original = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('one\r\ntwo\r\n')])
    await writeFile(file, original)
    const svc = new ExternalFileService()
    await svc.resolveOpen([file], vault)
    const content = await svc.read(file)
    expect(content).toBe('one\ntwo\n')
    await svc.write(file, `${content}three\n`)
    const saved = await readFile(file)
    expect(saved.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))).toBe(true)
    expect(saved.subarray(3).toString()).toBe('one\r\ntwo\r\nthree\r\n')
  })

  it('restores a persisted allowlist and only persists open, allowed tabs', async () => {
    const a = join(outside, 'a.md')
    const b = join(outside, 'b.md')
    await writeFile(a, 'A')
    const svc = new ExternalFileService()
    svc.restore([a, 'relative.md', join(outside, 'x.png')])
    expect(svc.isAllowed(a)).toBe(true)
    expect(svc.isAllowed(join(outside, 'x.png'))).toBe(false)
    expect(await svc.read(a)).toBe('A')
    // A renderer-supplied tab list can't add b to what gets persisted.
    expect(svc.persistable(['notes/x.md', a, b])).toEqual([a])
  })

  it('matches allowlist entries case-insensitively on Windows', () => {
    const svc = new ExternalFileService('win32')
    svc.allow('C:\\Users\\Me\\A.md')
    expect(svc.isAllowed('c:\\users\\me\\a.md')).toBe(true)
    const posix = new ExternalFileService('linux')
    posix.allow('/home/me/A.md')
    expect(posix.isAllowed('/home/me/a.md')).toBe(false)
  })

  it('queues open requests until drained', () => {
    const svc = new ExternalFileService()
    svc.enqueue([{ kind: 'vault', path: 'a.md' }])
    svc.enqueue([{ kind: 'external', path: '/x/b.md' }])
    expect(svc.takePending()).toHaveLength(2)
    expect(svc.takePending()).toEqual([])
  })
})
