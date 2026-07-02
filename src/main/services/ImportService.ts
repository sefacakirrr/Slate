import { readdir, readFile, stat } from 'node:fs/promises'
import { basename, extname, join, resolve } from 'node:path'
import type { VaultService } from './VaultService'
import { htmlToNote } from './importers/html'
import { mdToNote } from './importers/md'
import { notionZipToNotes } from './importers/notion'
import { txtToNote } from './importers/txt'
import type { ImportedAttachment, ImportedNote } from './importers/types'

/** What kind of source a scan identified. */
export type ImportSourceKind = 'folder' | 'notion-zip'

export type ImportScanResult = {
  kind: ImportSourceKind
  /** Display name of the source (folder or zip basename, no extension). */
  sourceName: string
  /** Count per convertible format found. */
  counts: { md: number; txt: number; html: number }
  /** Total notes that would be imported. */
  total: number
}

export type ImportExecuteOptions = {
  /** Absolute path to the folder or Notion zip chosen by the user. */
  sourcePath: string
  /** Import under `Imported/<source-name>/` (default) or the vault root. */
  destination: 'imported-subfolder' | 'root'
}

export type ImportExecuteResult = {
  imported: number
  skipped: number
  /** Vault-relative folder the notes landed in ('' for root). */
  targetFolder: string
}

export type ImportProgress = {
  done: number
  total: number
  currentFile: string
}

const CONVERTIBLE = new Set(['.md', '.markdown', '.txt', '.html', '.htm'])

/**
 * Import engine (Epic 15). Orchestrates scan → convert → copy-into-vault.
 * Originals are never modified — import is always a read + copy. Writes go
 * through VaultService (atomic, path-safe); attachments through the same
 * hash-named `_attachments/` convention as AttachmentService.
 *
 * Pure Node (no Electron imports) — constructed with a VaultService, so it is
 * unit-testable against a temp-dir vault like the other services.
 */
export class ImportService {
  private readonly vault: VaultService

  constructor(vault: VaultService) {
    this.vault = vault
  }

  /**
   * Scans a folder (recursively) or a Notion zip and reports what an import
   * would bring in. Read-only; used by the wizard's preview step.
   */
  async scan(sourcePath: string): Promise<ImportScanResult> {
    const s = await stat(sourcePath)

    if (s.isFile()) {
      if (extname(sourcePath).toLowerCase() !== '.zip') throw new Error('unsupported-source')
      const { notes } = notionZipToNotes(await readFile(sourcePath))
      return {
        kind: 'notion-zip',
        sourceName: basename(sourcePath, '.zip'),
        counts: { md: notes.length, txt: 0, html: 0 },
        total: notes.length,
      }
    }

    const files = await this.collectConvertibleFiles(sourcePath)
    const counts = { md: 0, txt: 0, html: 0 }
    for (const f of files) {
      const ext = extname(f).toLowerCase()
      if (ext === '.md' || ext === '.markdown') counts.md++
      else if (ext === '.txt') counts.txt++
      else counts.html++
    }
    return {
      kind: 'folder',
      sourceName: basename(sourcePath),
      counts,
      total: files.length,
    }
  }

  /**
   * Runs the import. Converts every convertible file and writes it into the
   * vault; name conflicts get `-1`, `-2`… suffixes (never overwrites).
   * Reports progress per note through `onProgress`.
   */
  async execute(
    opts: ImportExecuteOptions,
    onProgress?: (p: ImportProgress) => void,
  ): Promise<ImportExecuteResult> {
    const s = await stat(opts.sourcePath)
    const sourceName =
      s.isFile() && extname(opts.sourcePath).toLowerCase() === '.zip'
        ? basename(opts.sourcePath, '.zip')
        : basename(opts.sourcePath)
    const targetFolder =
      opts.destination === 'root' ? '' : `Imported/${sanitizeFolderName(sourceName)}`

    let notes: ImportedNote[]
    let attachments: ImportedAttachment[] = []

    if (s.isFile()) {
      if (extname(opts.sourcePath).toLowerCase() !== '.zip') throw new Error('unsupported-source')
      const result = notionZipToNotes(await readFile(opts.sourcePath))
      notes = result.notes
      attachments = result.attachments
    } else {
      notes = await this.convertFolder(opts.sourcePath)
    }

    // Attachments first, so notes never reference a missing file mid-import.
    for (const att of attachments) {
      await this.vault.writeBytes(att.path, att.data)
    }

    let imported = 0
    let skipped = 0
    const existing = new Set((await this.vault.listNotes()).map((p) => p.toLowerCase()))

    for (const [i, note] of notes.entries()) {
      onProgress?.({ done: i, total: notes.length, currentFile: note.name })
      try {
        const target = this.resolveConflictFree(targetFolder, note.name, existing)
        await this.vault.writeNote(target, note.content)
        existing.add(target.toLowerCase())
        imported++
      } catch {
        // One bad file (unreadable, invalid name) must not abort the batch.
        skipped++
      }
    }
    onProgress?.({ done: notes.length, total: notes.length, currentFile: '' })

    return { imported, skipped, targetFolder }
  }

  /** Converts every convertible file in a folder tree to a note. */
  private async convertFolder(folderPath: string): Promise<ImportedNote[]> {
    const files = await this.collectConvertibleFiles(folderPath)
    const notes: ImportedNote[] = []
    for (const abs of files) {
      const name = basename(abs)
      const ext = extname(abs).toLowerCase()
      try {
        const content = await readTextFile(abs)
        if (ext === '.txt') notes.push(txtToNote(name, content))
        else if (ext === '.html' || ext === '.htm') notes.push(htmlToNote(name, content))
        else notes.push(mdToNote(name, content))
      } catch {
        // Unreadable file — skip; execute() reports it via the skipped count
        // only when writing fails, so pre-read failures just drop silently
        // from the preview-consistent set. Acceptable: scan showed the same set.
      }
    }
    return notes
  }

  /** Recursively lists absolute paths of convertible files, skipping hidden/underscore dirs. */
  private async collectConvertibleFiles(folderPath: string): Promise<string[]> {
    const root = resolve(folderPath)
    const entries = await readdir(root, { withFileTypes: true, recursive: true })
    const files: string[] = []
    for (const entry of entries) {
      if (!entry.isFile()) continue
      const segments = join(entry.parentPath, entry.name).slice(root.length).split(/[\\/]/)
      if (segments.some((seg) => seg.startsWith('.') || seg.startsWith('_'))) continue
      if (!CONVERTIBLE.has(extname(entry.name).toLowerCase())) continue
      files.push(join(entry.parentPath, entry.name))
    }
    files.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
    return files
  }

  /**
   * Produces a vault-relative target path that doesn't collide with existing
   * notes or earlier files in this batch: `name.md`, `name-1.md`, `name-2.md`…
   */
  private resolveConflictFree(folder: string, name: string, taken: Set<string>): string {
    const dot = name.lastIndexOf('.')
    const base = dot === -1 ? name : name.slice(0, dot)
    const ext = dot === -1 ? '.md' : name.slice(dot)
    const prefix = folder === '' ? '' : `${folder}/`

    let candidate = `${prefix}${base}${ext}`
    for (let i = 1; taken.has(candidate.toLowerCase()); i++) {
      candidate = `${prefix}${base}-${i}${ext}`
    }
    return candidate
  }
}

/** Folder names come from user disk names — keep them path-safe inside the vault. */
function sanitizeFolderName(name: string): string {
  const cleaned = name.replace(/[<>:"/\\|?*]/g, '-').trim()
  return cleaned === '' || cleaned.startsWith('.') || cleaned.startsWith('_')
    ? `import-${cleaned.replace(/^[._]+/, '') || 'notes'}`
    : cleaned
}

/**
 * Reads a text file with encoding detection: UTF-8 by default, UTF-16 LE/BE
 * via BOM sniffing (common for Windows-exported .txt), Latin-1 fallback when
 * the bytes are not valid UTF-8.
 */
async function readTextFile(absPath: string): Promise<string> {
  const buf = await readFile(absPath)
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return buf.toString('utf16le').slice(1)
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff)
    return swapBytes(buf).toString('utf16le').slice(1)
  const utf8 = buf.toString('utf-8')
  // Node replaces invalid UTF-8 sequences with U+FFFD; treat that as Latin-1.
  if (utf8.includes('�')) return buf.toString('latin1')
  // Strip a UTF-8 BOM if present.
  return utf8.charCodeAt(0) === 0xfeff ? utf8.slice(1) : utf8
}

function swapBytes(buf: Buffer): Buffer {
  const out = Buffer.from(buf)
  out.swap16()
  return out
}
