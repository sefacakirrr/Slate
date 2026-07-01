import { randomBytes } from 'node:crypto'
import { mkdir, open, readdir, readFile, rename, rm, stat, unlink } from 'node:fs/promises'
import { dirname, relative, resolve, sep } from 'node:path'
import { isEncryptedPath } from './EncryptionService'

/** Extensions Slate treats as notes. User-decided at bootstrap. */
const NOTE_EXTENSIONS = ['.md', '.markdown', '.txt']

/** The suffix a locked note carries on top of its note extension (Epic 10). */
const ENC_SUFFIX = '.enc'

function stripFormatting(text: string): string {
  return text
    .replace(/^\{align:(left|center|right)\}/gm, '')
    .replace(/\{color:\w+\}/g, '')
    .replace(/\{\/color\}/g, '')
    .replace(/==([^=]+)==\{\.\w+\}/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(?<!\w)_([^_]+)_(?!\w)/g, '$1')
    .replace(/\+\+([^+]+)\+\+/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^(\s*)[-*+]\s\[[ xX]\]\s?/gm, '$1')
    .trim()
}

/** A note's vault-relative path paired with its on-disk modification time (ms). */
export type NoteStat = {
  path: string
  mtime: number
}

/**
 * Read-side vault operations. Pure Node — no Electron import — constructed with
 * the absolute vault root, so it is unit-testable against a temp directory.
 *
 * The single security boundary is `resolveSafe`: every path that comes from the
 * renderer is resolved against the vault root and rejected if it escapes.
 */
export class VaultService {
  private readonly vaultRoot: string

  constructor(vaultRoot: string) {
    this.vaultRoot = resolve(vaultRoot)
  }

  /**
   * Recursively lists note files, returning vault-relative paths (forward
   * slashes) sorted case-insensitively. Excludes any entry whose path contains
   * a segment starting with `_` or `.` (hides `_attachments/`, `.git/`,
   * dotfiles), and any file without an allowed note extension.
   */
  async listNotes(): Promise<string[]> {
    return (await this.collectNoteFiles()).map((f) => f.rel)
  }

  /**
   * Same set and order as {@link listNotes}, but each path paired with its file
   * modification time (ms, integer). The reconciliation coordinator compares
   * these against the index's stored mtimes to detect external changes.
   */
  async listNotesWithMtime(): Promise<NoteStat[]> {
    const files = await this.collectNoteFiles()
    return Promise.all(
      files.map(async (f) => ({ path: f.rel, mtime: Math.floor((await stat(f.abs)).mtimeMs) })),
    )
  }

  /**
   * Returns note metadata for the list view: path, title (first non-empty line),
   * snippet (first ~120 chars), and mtime. Sorted by mtime descending (most recent first).
   */
  async listNotesDetailed(): Promise<
    { path: string; title: string; snippet: string; mtime: number }[]
  > {
    const files = await this.collectNoteFiles()
    const items = await Promise.all(
      files.map(async (f) => {
        // Locked notes: never read/parse ciphertext. Title comes from the
        // filename; the snippet is a locked marker. mtime still comes from stat.
        if (isEncryptedPath(f.rel)) {
          const s = await stat(f.abs)
          return {
            path: f.rel,
            title: lockedNoteTitle(f.rel),
            snippet: '🔒 Locked',
            mtime: Math.floor(s.mtimeMs),
          }
        }
        const [content, s] = await Promise.all([readFile(f.abs, 'utf-8'), stat(f.abs)])
        const lines = content.split('\n')
        const titleLine = lines.find((l) => l.trim().length > 0) ?? ''
        const title =
          stripFormatting(titleLine.replace(/^#+\s*/, '')) ||
          f.rel
            .split('/')
            .pop()
            ?.replace(/\.\w+$/, '') ||
          f.rel
        const snippetText = stripFormatting(
          lines
            .filter((l) => l.trim().length > 0)
            .slice(0, 3)
            .join(' ')
            .slice(0, 180),
        ).slice(0, 120)
        return { path: f.rel, title, snippet: snippetText, mtime: Math.floor(s.mtimeMs) }
      }),
    )
    items.sort((a, b) => b.mtime - a.mtime)
    return items
  }

  /** Lists all subdirectory paths (vault-relative, forward-slash) excluding hidden/underscored ones. */
  async listDirs(): Promise<string[]> {
    const entries = await readdir(this.vaultRoot, { withFileTypes: true, recursive: true })
    const dirs: string[] = []
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const abs = resolve(entry.parentPath, entry.name)
      const rel = relative(this.vaultRoot, abs)
      const segments = rel.split(sep)
      if (segments.some((s) => s.startsWith('_') || s.startsWith('.'))) continue
      dirs.push(segments.join('/'))
    }
    dirs.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
    return dirs
  }

  /** A single note's modification time (ms, integer). Path is vault-safe. */
  async statMtime(relPath: string): Promise<number> {
    const abs = this.resolveSafe(relPath)
    return Math.floor((await stat(abs)).mtimeMs)
  }

  /** Reads a note's UTF-8 content. Throws if the path escapes the vault. */
  async readNote(relPath: string): Promise<string> {
    const abs = this.resolveSafe(relPath)
    return readFile(abs, 'utf-8')
  }

  /**
   * Reads a note's raw bytes (for encrypted-note containers). Path is vault-safe.
   */
  async readBytes(relPath: string): Promise<Buffer> {
    const abs = this.resolveSafe(relPath)
    return readFile(abs)
  }

  /**
   * Atomically writes raw bytes to a note (write-temp-fsync-rename), mirroring
   * {@link writeNote} but for binary content like an encrypted container.
   */
  async writeBytes(relPath: string, data: Buffer): Promise<void> {
    const abs = this.resolveSafe(relPath)
    await mkdir(dirname(abs), { recursive: true })

    const tmp = `${abs}.tmp-${randomBytes(6).toString('hex')}`
    const handle = await open(tmp, 'w')
    try {
      await handle.writeFile(data)
      await handle.sync()
    } finally {
      await handle.close()
    }
    await rename(tmp, abs)
  }

  /**
   * Recursively collects note files as `{ rel, abs }`, applying the listing's
   * exclusion rules (segments starting with `_`/`.`, non-note extensions) and
   * the case-insensitive sort. Shared by {@link listNotes} and
   * {@link listNotesWithMtime} so both see exactly the same set.
   */
  private async collectNoteFiles(): Promise<{ rel: string; abs: string }[]> {
    const entries = await readdir(this.vaultRoot, {
      withFileTypes: true,
      recursive: true,
    })

    const files: { rel: string; abs: string }[] = []
    for (const entry of entries) {
      if (!entry.isFile()) continue

      // entry.parentPath is the absolute dir; build the vault-relative path.
      const abs = resolve(entry.parentPath, entry.name)
      const rel = relative(this.vaultRoot, abs)
      const segments = rel.split(sep)

      if (segments.some((s) => s.startsWith('_') || s.startsWith('.'))) continue
      if (!isNoteFile(entry.name)) continue

      files.push({ rel: segments.join('/'), abs })
    }

    files.sort((a, b) => a.rel.toLowerCase().localeCompare(b.rel.toLowerCase()))
    return files
  }

  /**
   * Atomically writes UTF-8 content to a note. Writes + fsyncs a temp file,
   * then renames it over the canonical path. If the process dies before the
   * rename, the original file is untouched (only a stray `.tmp-*` may remain).
   */
  async writeNote(relPath: string, content: string): Promise<void> {
    const abs = this.resolveSafe(relPath)
    await mkdir(dirname(abs), { recursive: true })

    const tmp = `${abs}.tmp-${randomBytes(6).toString('hex')}`
    const handle = await open(tmp, 'w')
    try {
      await handle.writeFile(content, 'utf-8')
      await handle.sync()
    } finally {
      await handle.close()
    }
    await rename(tmp, abs)
  }

  /**
   * Creates a new empty note, rejecting if one already exists at the path.
   * Uses an exclusive-create open (`wx`) so the existence check and creation
   * are a single atomic syscall — no temp-rename needed for an empty file, and
   * no check-then-write race. Throws `Error('file-exists')` if the path is taken.
   */
  async createNote(relPath: string): Promise<void> {
    const abs = this.resolveSafe(relPath)
    await mkdir(dirname(abs), { recursive: true })

    try {
      const handle = await open(abs, 'wx')
      await handle.close()
    } catch (err) {
      if (err instanceof Error && (err as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new Error('file-exists')
      }
      throw err
    }
  }

  /**
   * Renames/moves a note within the vault. Both paths are vault-safe. Rejects:
   * a target without an allowed note extension (`invalid-extension`) so the
   * renamed file can't vanish from the listing, and a target that already
   * exists (`file-exists`) so a rename never silently overwrites another note.
   */
  async renameNote(fromRel: string, toRel: string): Promise<void> {
    const fromAbs = this.resolveSafe(fromRel)
    const toAbs = this.resolveSafe(toRel)
    // Accept locked notes (`.md.enc`) too, so a locked note can be moved/renamed
    // without the guard rejecting its `.enc` suffix.
    if (!isNoteFile(toRel)) throw new Error('invalid-extension')

    // No-overwrite guard: reject if something already lives at the target.
    try {
      await stat(toAbs)
      throw new Error('file-exists')
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code !== 'ENOENT') throw err // re-throw 'file-exists' and real errors
    }

    await mkdir(dirname(toAbs), { recursive: true })
    await rename(fromAbs, toAbs)
  }

  /** Moves/renames a folder. Rejects if the target already exists. */
  async renameFolder(fromRel: string, toRel: string): Promise<void> {
    const fromAbs = this.resolveSafe(fromRel)
    const toAbs = this.resolveSafe(toRel)
    if (toAbs.startsWith(fromAbs + sep)) throw new Error('cannot-move-into-self')
    try {
      await stat(toAbs)
      throw new Error('folder-exists')
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code !== 'ENOENT') throw err
    }
    await mkdir(dirname(toAbs), { recursive: true })
    await rename(fromAbs, toAbs)
  }

  /**
   * Creates a directory inside the vault. Uses recursive mkdir so intermediate
   * segments are created. Rejects if the final path already exists as a file.
   */
  async createFolder(relPath: string): Promise<void> {
    const abs = this.resolveSafe(relPath)
    await mkdir(abs, { recursive: true })
  }

  /**
   * Deletes a note. Tolerates an already-missing file (returns success) so a
   * double-delete or a file removed externally doesn't surface an error.
   */
  async deleteNote(relPath: string): Promise<void> {
    const abs = this.resolveSafe(relPath)
    try {
      await unlink(abs)
    } catch (err) {
      if (err instanceof Error && (err as NodeJS.ErrnoException).code === 'ENOENT') {
        return
      }
      throw err
    }
  }

  /** Recursively deletes a folder and all its contents. */
  async deleteFolder(relPath: string): Promise<void> {
    const abs = this.resolveSafe(relPath)
    await rm(abs, { recursive: true, force: true })
  }

  /**
   * Resolves a vault-relative path to an absolute path and asserts it stays
   * inside the vault root. Rejects `../` traversal and absolute paths that
   * point elsewhere. Throws `Error('path-outside-vault')` on escape.
   */
  private resolveSafe(relPath: string): string {
    const abs = resolve(this.vaultRoot, relPath)
    if (abs !== this.vaultRoot && !abs.startsWith(this.vaultRoot + sep)) {
      throw new Error('path-outside-vault')
    }
    return abs
  }
}

function hasNoteExtension(name: string): boolean {
  const lower = name.toLowerCase()
  return NOTE_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

/** A locked note's filename: a note extension followed by `.enc` (e.g. `a.md.enc`). */
function isLockedNoteName(name: string): boolean {
  return (
    name.toLowerCase().endsWith(ENC_SUFFIX) && hasNoteExtension(name.slice(0, -ENC_SUFFIX.length))
  )
}

/** Whether the file is listable as a note: a plaintext note or a locked note. */
function isNoteFile(name: string): boolean {
  return hasNoteExtension(name) || isLockedNoteName(name)
}

/** A locked note's display title: strip `.enc` and the note extension. `a/b.md.enc` -> `b`. */
function lockedNoteTitle(relPath: string): string {
  const base = relPath.split('/').pop() ?? relPath
  return base.slice(0, -ENC_SUFFIX.length).replace(/\.\w+$/, '')
}
