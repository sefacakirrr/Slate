import { open, readdir, readFile, stat } from 'node:fs/promises'
import { basename, extname, join, relative, resolve } from 'node:path'
import { htmlToNote } from './importers/html'
import { mdToNote } from './importers/md'
import { notionZipToNotes } from './importers/notion'
import { rtfToNote } from './importers/rtf'
import { textFileToNote } from './importers/text'
import { txtToNote } from './importers/txt'
import type { ImportedAttachment, ImportedNote } from './importers/types'
import type { VaultService } from './VaultService'

/** What kind of source a scan identified. */
export type ImportSourceKind = 'folder' | 'notion-zip'

export type ImportScanResult = {
  kind: ImportSourceKind
  /** Display name of the source (folder or zip basename, no extension). */
  sourceName: string
  /** Count per convertible format found. `text` = generic plain-text files
   *  (code, configs, logs, extension-less Sublime/scratch notes). */
  counts: { md: number; txt: number; html: number; rtf: number; text: number }
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

type FileKind = 'md' | 'txt' | 'html' | 'rtf' | 'text'

type ClassifiedFile = {
  abs: string
  /** Source-relative path (forward slashes) — preserved in the vault. */
  rel: string
  kind: FileKind
}

/** Formats with a dedicated converter, keyed by extension. */
const KNOWN_KINDS: Record<string, FileKind> = {
  '.md': 'md',
  '.markdown': 'md',
  '.txt': 'txt',
  '.html': 'html',
  '.htm': 'html',
  '.rtf': 'rtf',
}

/**
 * Extensions that are certainly not text notes — skipped without reading.
 * Anything NOT listed here and not a known format gets content-sniffed, so
 * code files, configs, logs, and extension-less notes all import.
 */
const BINARY_EXTENSIONS = new Set([
  // images / video / audio
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.bmp',
  '.avif',
  '.ico',
  '.icns',
  '.tiff',
  '.heic',
  '.mp4',
  '.mov',
  '.avi',
  '.mkv',
  '.webm',
  '.mp3',
  '.wav',
  '.flac',
  '.ogg',
  '.m4a',
  '.aac',
  // archives / packages
  '.zip',
  '.rar',
  '.7z',
  '.tar',
  '.gz',
  '.bz2',
  '.xz',
  '.dmg',
  '.iso',
  '.pkg',
  '.deb',
  '.rpm',
  // executables / libraries / bytecode
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.app',
  '.msi',
  '.bin',
  '.class',
  '.pyc',
  '.wasm',
  // documents with binary containers
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.pages',
  '.numbers',
  '.key',
  '.odt',
  // data / misc
  '.db',
  '.sqlite',
  '.sqlite3',
  '.dat',
  '.idx',
  '.pack',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
  '.eot',
  '.psd',
  '.ai',
  '.sketch',
  '.fig',
  '.blend',
  '.o',
  '.a',
  '.lib',
  '.pdb',
  '.sublime-workspace',
])

/** Notes bigger than this are almost certainly not notes (logs, dumps). */
const MAX_NOTE_SIZE = 10 * 1024 * 1024 // 10 MB

/**
 * Import engine (Epic 15). Orchestrates scan → convert → copy-into-vault.
 * Originals are never modified — import is always a read + copy. Writes go
 * through VaultService (atomic, path-safe); attachments through the same
 * hash-named `_attachments/` convention as AttachmentService.
 *
 * Folder imports preserve the source's directory structure inside the vault.
 * Files are accepted by capability, not extension: known formats (md, txt,
 * html, rtf) convert with dedicated importers; every other file is
 * content-sniffed and imported as plain text when it is readable text.
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
        counts: { md: notes.length, txt: 0, html: 0, rtf: 0, text: 0 },
        total: notes.length,
      }
    }

    const files = await this.collectImportableFiles(sourcePath)
    const counts = { md: 0, txt: 0, html: 0, rtf: 0, text: 0 }
    for (const f of files) counts[f.kind]++
    return {
      kind: 'folder',
      sourceName: basename(sourcePath),
      counts,
      total: files.length,
    }
  }

  /**
   * Runs the import. Converts every importable file and writes it into the
   * vault, mirroring the source's folder structure; name conflicts get `-1`,
   * `-2`… suffixes (never overwrites). Reports progress per note.
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

  /** Converts every importable file in a folder tree, keeping its structure. */
  private async convertFolder(folderPath: string): Promise<ImportedNote[]> {
    const files = await this.collectImportableFiles(folderPath)
    const notes: ImportedNote[] = []
    for (const f of files) {
      const name = basename(f.rel)
      const dir = f.rel.slice(0, f.rel.length - name.length) // '' or 'sub/dir/'
      try {
        const content = await readTextFile(f.abs)
        const note = convertFile(f.kind, name, content)
        notes.push({ name: `${dir}${note.name}`, content: note.content })
      } catch {
        // Unreadable file — drop it; scan showed the same set so counts stay
        // consistent for anything readable.
      }
    }
    return notes
  }

  /**
   * Recursively classifies importable files, skipping hidden/underscore dirs.
   * Known formats classify by extension; unknown extensions (and none at all)
   * are content-sniffed and imported as generic text when readable.
   */
  private async collectImportableFiles(folderPath: string): Promise<ClassifiedFile[]> {
    const root = resolve(folderPath)
    const entries = await readdir(root, { withFileTypes: true, recursive: true })
    const files: ClassifiedFile[] = []
    for (const entry of entries) {
      if (!entry.isFile()) continue
      const abs = join(entry.parentPath, entry.name)
      const rel = relative(root, abs).split(/[\\/]/).join('/')
      if (rel.split('/').some((seg) => seg.startsWith('.') || seg.startsWith('_'))) continue

      const ext = extname(entry.name).toLowerCase()
      const known = KNOWN_KINDS[ext]
      if (known !== undefined) {
        files.push({ abs, rel, kind: known })
        continue
      }
      if (BINARY_EXTENSIONS.has(ext)) continue
      if (await isReadableText(abs)) files.push({ abs, rel, kind: 'text' })
    }
    files.sort((a, b) => a.rel.toLowerCase().localeCompare(b.rel.toLowerCase()))
    return files
  }

  /**
   * Produces a vault-relative target path that doesn't collide with existing
   * notes or earlier files in this batch: `name.md`, `name-1.md`, `name-2.md`…
   * `name` may contain directories (preserved structure) — the suffix is
   * applied to the basename only.
   */
  private resolveConflictFree(folder: string, name: string, taken: Set<string>): string {
    const slash = name.lastIndexOf('/')
    const dir = slash === -1 ? '' : name.slice(0, slash + 1)
    const file = slash === -1 ? name : name.slice(slash + 1)
    const dot = file.lastIndexOf('.')
    const base = dot === -1 ? file : file.slice(0, dot)
    const ext = dot === -1 ? '.md' : file.slice(dot)
    const prefix = folder === '' ? dir : `${folder}/${dir}`

    let candidate = `${prefix}${base}${ext}`
    for (let i = 1; taken.has(candidate.toLowerCase()); i++) {
      candidate = `${prefix}${base}-${i}${ext}`
    }
    return candidate
  }
}

/** Routes a classified file through its converter. */
function convertFile(kind: FileKind, name: string, content: string): ImportedNote {
  switch (kind) {
    case 'md':
      return mdToNote(name, content)
    case 'txt':
      return txtToNote(name, content)
    case 'html':
      return htmlToNote(name, content)
    case 'rtf':
      return rtfToNote(name, content)
    case 'text':
      return textFileToNote(name, content)
  }
}

/**
 * Content sniff: reads the first 8 KB and decides whether the file is
 * readable text. Null bytes or a high control-character ratio mean binary.
 * Empty files count as text (an empty note is valid). Oversized files are
 * rejected — a >10 MB "note" is a log or a dump, not a note.
 */
async function isReadableText(absPath: string): Promise<boolean> {
  const s = await stat(absPath)
  if (s.size > MAX_NOTE_SIZE) return false
  if (s.size === 0) return true

  const handle = await open(absPath, 'r')
  try {
    const sample = Buffer.alloc(Math.min(8192, s.size))
    await handle.read(sample, 0, sample.length, 0)

    // UTF-16 BOM → definitely text.
    if (sample.length >= 2) {
      if ((sample[0] === 0xff && sample[1] === 0xfe) || (sample[0] === 0xfe && sample[1] === 0xff))
        return true
    }

    let suspicious = 0
    for (const byte of sample) {
      if (byte === 0) return false
      if (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) suspicious++
    }
    return suspicious / sample.length < 0.02
  } finally {
    await handle.close()
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
