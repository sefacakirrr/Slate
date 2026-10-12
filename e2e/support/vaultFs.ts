import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, relative, sep } from 'node:path'

/**
 * File-system view of the test vault, addressed with vault-relative paths
 * (forward slashes, as the app uses them).
 */
export class VaultFs {
  constructor(readonly root: string) {}

  /** Absolute path of a vault-relative path. */
  abs(rel: string): string {
    return join(this.root, ...rel.split('/'))
  }

  exists(rel: string): boolean {
    return existsSync(this.abs(rel))
  }

  async read(rel: string): Promise<string> {
    return readFile(this.abs(rel), 'utf-8')
  }

  async readBytes(rel: string): Promise<Buffer> {
    return readFile(this.abs(rel))
  }

  /** Writes a file, creating parent folders. */
  async write(rel: string, content: string | Buffer): Promise<void> {
    await mkdir(dirname(this.abs(rel)), { recursive: true })
    await writeFile(this.abs(rel), content)
  }

  async mkdir(rel: string): Promise<void> {
    await mkdir(this.abs(rel), { recursive: true })
  }

  /**
   * All files under `rel` (default: vault root), vault-relative, sorted.
   * Includes dot-dirs such as `.trash` unless `skipDot` is set.
   */
  async listFiles(rel = '', { skipDot = false } = {}): Promise<string[]> {
    const out: string[] = []
    const walk = async (dir: string): Promise<void> => {
      const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
      for (const e of entries) {
        if (skipDot && e.name.startsWith('.')) continue
        const full = join(dir, e.name)
        if (e.isDirectory()) await walk(full)
        else out.push(relative(this.root, full).split(sep).join('/'))
      }
    }
    await walk(this.abs(rel))
    return out.sort()
  }

  /** Ids of the in-app trash items (`.trash/<id>/`). */
  async trashIds(): Promise<string[]> {
    const entries = await readdir(this.abs('.trash'), { withFileTypes: true }).catch(() => [])
    return entries.filter((e) => e.isDirectory()).map((e) => e.name)
  }
}
