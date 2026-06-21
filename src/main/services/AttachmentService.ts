import { createHash, randomBytes } from 'node:crypto'
import { mkdir, open, rename, stat } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

export class AttachmentService {
  private readonly getVaultPath: () => string | null

  constructor(getVaultPath: () => string | null) {
    this.getVaultPath = getVaultPath
  }

  async store(
    buffer: Buffer,
    originalName: string,
  ): Promise<{ relativePath: string; hash: string }> {
    const vaultPath = this.getVaultPath()
    if (vaultPath === null) {
      throw new Error('no-vault')
    }

    if (buffer.length > MAX_FILE_SIZE) {
      throw new Error('file-too-large')
    }

    if (buffer.length === 0) {
      throw new Error('empty-file')
    }

    const hash = createHash('sha256').update(buffer).digest('hex')
    const ext = extractExtension(originalName)
    const filename = `${hash}${ext}`
    const relativePath = `_attachments/${filename}`

    const attachDir = resolve(vaultPath, '_attachments')
    const absPath = resolve(attachDir, filename)

    // Path safety: ensure resolved path stays within vault
    const vaultRoot = resolve(vaultPath)
    if (!absPath.startsWith(vaultRoot + sep) && absPath !== vaultRoot) {
      throw new Error('path-outside-vault')
    }

    // Dedup: if file with same hash already exists, skip write
    if (await this.fileExists(absPath)) {
      return { relativePath, hash }
    }

    await mkdir(attachDir, { recursive: true })

    // Atomic write: temp file → rename
    const tmp = `${absPath}.tmp-${randomBytes(6).toString('hex')}`
    const handle = await open(tmp, 'w')
    try {
      await handle.writeFile(buffer)
      await handle.sync()
    } finally {
      await handle.close()
    }
    await rename(tmp, absPath)

    return { relativePath, hash }
  }

  private async fileExists(absPath: string): Promise<boolean> {
    try {
      await stat(absPath)
      return true
    } catch {
      return false
    }
  }
}

function extractExtension(name: string): string {
  if (!name) return '.bin'
  const ext = extname(name).toLowerCase()
  if (!ext || ext === '.') return '.bin'
  return ext
}
