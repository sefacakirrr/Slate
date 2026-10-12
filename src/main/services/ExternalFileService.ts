import { readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { OpenFileRequest } from '@shared/types'

/**
 * Files opened from outside the app: drag & drop from the file manager, OS
 * "Open with" / double-click (argv, `second-instance`, macOS `open-file`).
 *
 * Pure Node (no Electron import) so it is unit-testable. Security boundary:
 * the renderer may only read/write absolute paths that main put on the
 * allowlist because the user explicitly opened them — never an arbitrary path
 * the renderer names.
 */

/** Extensions Slate opens from outside (same set the vault lists as notes). */
export const OPENABLE_EXTENSIONS = ['.md', '.markdown', '.txt'] as const

/** Larger files are rejected rather than loaded into the editor. */
export const MAX_EXTERNAL_FILE_BYTES = 10 * 1024 * 1024

type Platform = NodeJS.Platform

/** Line-ending + BOM shape of a text file, re-applied on save. */
export type TextFormat = { bom: boolean; eol: '\n' | '\r\n' }

const DEFAULT_FORMAT: TextFormat = { bom: false, eol: '\n' }

function pathFor(platform: Platform): path.PlatformPath {
  return platform === 'win32' ? path.win32 : path.posix
}

/** True for `.md` / `.markdown` / `.txt` (any case). */
export function isOpenableFile(filePath: string): boolean {
  const lower = filePath.toLowerCase()
  return OPENABLE_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

/**
 * Extracts the file paths to open from a process argv (cold start or a
 * `second-instance` launch). Skips the executable (and, in dev, the app path —
 * `skip` = 2), any `-`/`--` flag (e.g. `--hidden`, Chromium switches), and
 * anything that isn't an openable text file. Relative paths resolve against
 * `cwd`. Deduplicated, order preserved.
 */
export function parseOpenPaths(
  argv: readonly string[],
  opts: { cwd: string; skip: number; platform?: Platform },
): string[] {
  const platform = opts.platform ?? process.platform
  const p = pathFor(platform)
  const seen = new Set<string>()
  const out: string[] = []
  for (const arg of argv.slice(opts.skip)) {
    if (arg === '' || arg.startsWith('-')) continue
    if (!isOpenableFile(arg)) continue
    const abs = p.resolve(opts.cwd, arg)
    const key = platform === 'win32' ? abs.toLowerCase() : abs
    if (seen.has(key)) continue
    seen.add(key)
    out.push(abs)
  }
  return out
}

/**
 * If `absPath` lies inside `vaultRoot` (and in a part of the vault that the
 * vault lists — no `.hidden`/`_underscored` segment, same rule as
 * VaultService), returns its vault-relative path with forward slashes;
 * otherwise null. Case-insensitive on Windows; different drives and `..`
 * traversal are outside.
 */
export function vaultRelativePath(
  absPath: string,
  vaultRoot: string,
  platform: Platform = process.platform,
): string | null {
  const p = pathFor(platform)
  const rel = p.relative(p.resolve(vaultRoot), p.resolve(absPath))
  if (rel === '' || p.isAbsolute(rel)) return null
  const segments = rel.split(/[\\/]/)
  if (segments.some((s) => s === '..' || s === '' || s.startsWith('.') || s.startsWith('_'))) {
    return null
  }
  return segments.join('/')
}

/**
 * Decodes a text file's bytes for the editor: strips a UTF-8 BOM and
 * normalizes CRLF to LF (CodeMirror works in LF), remembering both so
 * `encodeText` can restore them. Throws `binary-file` (NUL bytes) or
 * `unsupported-encoding` (not valid UTF-8 — refusing beats corrupting it on save).
 */
export function decodeText(buf: Uint8Array): { content: string; format: TextFormat } {
  if (buf.includes(0)) throw new Error('binary-file')
  const bom = buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
      bom ? buf.subarray(3) : buf,
    )
  } catch {
    throw new Error('unsupported-encoding')
  }
  const crlf = text.match(/\r\n/g)?.length ?? 0
  const allLf = text.match(/\n/g)?.length ?? 0
  const eol: TextFormat['eol'] = crlf > 0 && crlf >= allLf - crlf ? '\r\n' : '\n'
  return { content: text.replace(/\r\n/g, '\n'), format: { bom, eol } }
}

/** Inverse of `decodeText`: applies the file's line endings and BOM. */
export function encodeText(content: string, format: TextFormat): Buffer {
  let text = content.replace(/\r\n/g, '\n')
  if (format.eol === '\r\n') text = text.replace(/\n/g, '\r\n')
  const body = Buffer.from(text, 'utf-8')
  return format.bom ? Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), body]) : body
}

/** Reads + validates a candidate file; throws a short error code on rejection. */
async function readValidated(absPath: string): Promise<{ content: string; format: TextFormat }> {
  let info: Awaited<ReturnType<typeof stat>>
  try {
    info = await stat(absPath)
  } catch {
    throw new Error('not-found')
  }
  if (!info.isFile()) throw new Error('not-a-file')
  if (info.size > MAX_EXTERNAL_FILE_BYTES) throw new Error('too-large')
  return decodeText(await readFile(absPath))
}

export class ExternalFileService {
  private readonly p: path.PlatformPath
  /** Normalized key → absolute path, for every path the user explicitly opened. */
  private readonly allowed = new Map<string, string>()
  /** Format seen at last read, re-applied on write. */
  private readonly formats = new Map<string, TextFormat>()
  /** Open requests waiting for the main renderer to drain them. */
  private pending: OpenFileRequest[] = []

  constructor(private readonly platform: Platform = process.platform) {
    this.p = pathFor(platform)
  }

  private key(absPath: string): string {
    const resolved = this.p.resolve(absPath)
    return this.platform === 'win32' ? resolved.toLowerCase() : resolved
  }

  /** Adds an absolute path to the allowlist (user explicitly opened it). */
  allow(absPath: string): void {
    if (!this.p.isAbsolute(absPath)) return
    this.allowed.set(this.key(absPath), this.p.resolve(absPath))
  }

  isAllowed(absPath: string): boolean {
    return this.p.isAbsolute(absPath) && this.allowed.has(this.key(absPath))
  }

  /** Re-allows paths persisted from a previous session (external tabs to restore). */
  restore(paths: readonly string[]): void {
    for (const p of paths) {
      if (typeof p === 'string' && isOpenableFile(p)) this.allow(p)
    }
  }

  /**
   * The allowlist entries worth persisting: allowed paths that are still open
   * as tabs. The renderer's tab list can only shrink this set, never grow it.
   */
  persistable(openTabs: readonly string[]): string[] {
    return openTabs.filter((t) => this.isAllowed(t))
  }

  private assertAllowed(absPath: string): void {
    if (!this.isAllowed(absPath)) throw new Error('not-allowed')
  }

  /** Reads an allowlisted external file for an editor tab (BOM stripped, LF). */
  async read(absPath: string): Promise<string> {
    this.assertAllowed(absPath)
    const { content, format } = await readValidated(absPath)
    this.formats.set(this.key(absPath), format)
    return content
  }

  /** Writes an allowlisted external file in place, preserving its BOM and line endings. */
  async write(absPath: string, content: string): Promise<void> {
    this.assertAllowed(absPath)
    const key = this.key(absPath)
    let format = this.formats.get(key)
    if (format === undefined) {
      try {
        format = decodeText(await readFile(absPath)).format
      } catch {
        format = DEFAULT_FORMAT
      }
      this.formats.set(key, format)
    }
    await writeFile(absPath, encodeText(content, format))
  }

  /**
   * Resolves paths the user asked to open into tab requests: inside the vault →
   * vault tab; elsewhere → allowlisted external tab; invalid → error entry.
   */
  async resolveOpen(
    paths: readonly string[],
    vaultRoot: string | null,
  ): Promise<OpenFileRequest[]> {
    const out: OpenFileRequest[] = []
    const seen = new Set<string>()
    for (const raw of paths) {
      if (typeof raw !== 'string' || raw === '' || !this.p.isAbsolute(raw)) continue
      const abs = this.p.resolve(raw)
      const key = this.key(abs)
      if (seen.has(key)) continue
      seen.add(key)
      if (!isOpenableFile(abs)) {
        out.push({ kind: 'error', path: abs, error: 'unsupported-type' })
        continue
      }
      let format: TextFormat
      try {
        format = (await readValidated(abs)).format
      } catch (err) {
        out.push({
          kind: 'error',
          path: abs,
          error: err instanceof Error ? err.message : String(err),
        })
        continue
      }
      const rel = vaultRoot !== null ? vaultRelativePath(abs, vaultRoot, this.platform) : null
      if (rel !== null) {
        out.push({ kind: 'vault', path: rel })
        continue
      }
      this.allow(abs)
      this.formats.set(key, format)
      out.push({ kind: 'external', path: abs })
    }
    return out
  }

  /** Queues resolved requests until the main renderer drains them. */
  enqueue(requests: readonly OpenFileRequest[]): void {
    this.pending.push(...requests)
  }

  /** Returns and clears the queued requests. */
  takePending(): OpenFileRequest[] {
    const out = this.pending
    this.pending = []
    return out
  }
}
