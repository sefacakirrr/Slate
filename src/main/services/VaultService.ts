import { randomBytes } from 'node:crypto'
import type { BigIntStats } from 'node:fs'
import {
  cp,
  mkdir,
  open,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import type { TrashItem } from '@shared/types'
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
    await replaceWithTemp(tmp, abs)
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
    await replaceWithTemp(tmp, abs)
  }

  /**
   * Creates a new empty note, rejecting if one already exists at the path.
   * Uses an exclusive-create open (`wx`) so the existence check and creation
   * are a single atomic syscall — no temp-rename needed for an empty file, and
   * no check-then-write race. Throws `Error('file-exists')` if the path is taken.
   */
  async createNote(relPath: string): Promise<void> {
    assertValidName(relPath)
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
    assertValidName(toRel)

    // No-overwrite guard: reject if something already lives at the target —
    // unless it's the source itself (a case-only rename on a case-insensitive FS).
    if (await occupiedByOther(fromAbs, toAbs)) throw new Error('file-exists')

    await mkdir(dirname(toAbs), { recursive: true })
    await renameRetrying(fromAbs, toAbs)
  }

  /** Moves/renames a folder. Rejects if the target already exists. */
  async renameFolder(fromRel: string, toRel: string): Promise<void> {
    const fromAbs = this.resolveSafe(fromRel)
    const toAbs = this.resolveSafe(toRel)
    if (toAbs.startsWith(fromAbs + sep)) throw new Error('cannot-move-into-self')
    assertValidName(toRel)
    if (await occupiedByOther(fromAbs, toAbs)) throw new Error('folder-exists')
    await mkdir(dirname(toAbs), { recursive: true })
    await renameRetrying(fromAbs, toAbs)
  }

  /**
   * Creates a directory inside the vault. Uses recursive mkdir so intermediate
   * segments are created. Rejects if the final path already exists as a file.
   */
  async createFolder(relPath: string): Promise<void> {
    assertValidName(relPath)
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

  // ---------------------------------------------------------------------------
  // Trash: user-initiated deletes move items into `<vault>/.trash/<id>/`, which
  // every walker already skips (dot-prefixed segment). Each item dir holds the
  // moved file/folder under its original basename plus a `meta.json`.
  // ---------------------------------------------------------------------------

  /**
   * Deletes a note or folder into the trash and returns its trash record.
   * Locked `.md.enc` notes are kept as-is (still encrypted). Throws `not-found`
   * if the source is missing, `invalid-path` for the vault root or the trash
   * itself.
   *
   * With `osTrash` (the OS recycle bin): the item is first *copied* into
   * `.trash/<id>/` (so Undo and the in-app Trash view work), then the original
   * is handed to `osTrash`. If the copy fails, nothing is deleted and the error
   * propagates. If `osTrash` fails, the original is moved into the trash dir
   * instead (the pre-recycle-bin behaviour). The original is never removed
   * permanently. Without `osTrash`, the original is simply moved.
   */
  async moveToTrash(
    relPath: string,
    kind: TrashItem['kind'],
    osTrash?: Remover,
  ): Promise<TrashItem> {
    const originalPath = normalizeRel(relPath)
    const abs = this.resolveSafe(originalPath)
    if (abs === this.vaultRoot || originalPath === '' || isTrashPath(originalPath)) {
      throw new Error('invalid-path')
    }
    const s = await stat(abs).catch(() => null)
    if (s === null) throw new Error('not-found')
    if (kind === 'folder' ? !s.isDirectory() : !s.isFile()) throw new Error('kind-mismatch')

    const name = originalPath.split('/').pop() ?? originalPath
    const id = `${Date.now()}-${randomBytes(4).toString('hex')}`
    const itemDir = this.trashItemDir(id)
    const dest = join(itemDir, name)
    await mkdir(itemDir, { recursive: true })
    const base: TrashItem = { id, kind, name, originalPath, deletedAt: new Date().toISOString() }
    // Meta first: a crash after it leaves an empty-but-listed item at worst,
    // never an orphaned file the Trash view can't see.
    try {
      await writeMeta(itemDir, base)
      if (osTrash === undefined) {
        await rename(abs, dest)
        return base
      }
      await cp(abs, dest, {
        recursive: true,
        errorOnExist: true,
        force: false,
        preserveTimestamps: true,
      })
    } catch (err) {
      await rm(itemDir, { recursive: true, force: true })
      throw err
    }

    // The copy is safe in `.trash`; now hand the original to the OS recycle bin.
    try {
      await osTrash(abs)
      const item: TrashItem = { ...base, osTrashed: true }
      await writeMeta(itemDir, item).catch(() => undefined)
      return item
    } catch (err) {
      console.error('OS trash failed, moving into the in-vault trash instead:', err)
    }
    // Fallback: if the original is somehow already gone, the copy stands in for it.
    if ((await stat(abs).catch(() => null)) === null) return base
    try {
      await rm(dest, { recursive: true, force: true })
      await rename(abs, dest)
    } catch (err) {
      await rm(itemDir, { recursive: true, force: true })
      throw err
    }
    return base
  }

  /** All trash items, newest first. Item dirs with missing/corrupt meta are skipped. */
  async listTrash(): Promise<TrashItem[]> {
    const root = join(this.vaultRoot, TRASH_DIR)
    const entries = await readdir(root, { withFileTypes: true }).catch(() => [])
    const items: TrashItem[] = []
    for (const entry of entries) {
      if (!entry.isDirectory() || !TRASH_ID_RE.test(entry.name)) continue
      const item = await readMeta(join(root, entry.name))
      if (item !== null && item.id === entry.name) items.push(item)
    }
    items.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt))
    return items
  }

  /**
   * Restores a trash item to its original path, recreating missing parent
   * folders. If the target is taken, a ` (restored)` suffix (then a counter) is
   * inserted before the extension. Returns the restored path, its kind, and the
   * vault-relative note paths now back on disk (for re-indexing).
   */
  async restoreFromTrash(
    id: string,
  ): Promise<{ path: string; kind: TrashItem['kind']; notes: string[] }> {
    const itemDir = this.trashItemDir(id)
    const item = await readMeta(itemDir)
    if (item === null) throw new Error('trash-item-not-found')
    const src = join(itemDir, item.name)
    await stat(src).catch(() => {
      throw new Error('trash-item-not-found')
    })

    const target = await this.freeRestoreTarget(item)
    const targetAbs = this.resolveSafe(target)
    await mkdir(dirname(targetAbs), { recursive: true })
    await rename(src, targetAbs)
    await rm(itemDir, { recursive: true, force: true })

    const notes =
      item.kind === 'note'
        ? [target]
        : (await this.listNotes()).filter((p) => p.startsWith(`${target}/`))
    return { path: target, kind: item.kind, notes }
  }

  /** Absolute path of a trash item's directory. */
  trashItemDir(id: string): string {
    if (!TRASH_ID_RE.test(id)) throw new Error('invalid-trash-id')
    return join(this.vaultRoot, TRASH_DIR, id)
  }

  /**
   * Permanently removes one trash item. An item whose original already went to
   * the OS recycle bin (`osTrashed`) is just a copy and is removed with
   * `rm -rf` (no duplicate in the recycle bin). Any other item holds the only
   * copy, so it goes to `osTrash` when given (falling back to `rm -rf`).
   */
  async deleteTrashItem(id: string, osTrash?: Remover): Promise<void> {
    const dir = this.trashItemDir(id)
    await removeTrashDir(dir, await readMeta(dir), osTrash)
  }

  /** Permanently removes every trash item. Returns how many were removed. */
  async emptyTrash(osTrash?: Remover): Promise<number> {
    const items = await this.listTrash()
    for (const item of items) await removeTrashDir(this.trashItemDir(item.id), item, osTrash)
    return items.length
  }

  /** Permanently removes trash items deleted more than `maxAgeMs` before `now`. */
  async purgeTrash(maxAgeMs: number, osTrash?: Remover, now = Date.now()): Promise<number> {
    const items = await this.listTrash()
    let purged = 0
    for (const item of items) {
      const deleted = Date.parse(item.deletedAt)
      if (Number.isNaN(deleted) || now - deleted <= maxAgeMs) continue
      await removeTrashDir(this.trashItemDir(item.id), item, osTrash)
      purged++
    }
    return purged
  }

  /** First free vault-relative path for restoring `item` (original, then suffixed). */
  private async freeRestoreTarget(item: TrashItem): Promise<string> {
    const exists = async (rel: string): Promise<boolean> =>
      stat(this.resolveSafe(rel)).then(
        () => true,
        () => false,
      )
    if (!(await exists(item.originalPath))) return item.originalPath

    const slash = item.originalPath.lastIndexOf('/')
    const dir = slash === -1 ? '' : item.originalPath.slice(0, slash + 1)
    const [stem, ext] = item.kind === 'note' ? splitNoteExt(item.name) : [item.name, '']
    for (let n = 1; n < 1000; n++) {
      const suffix = n === 1 ? ' (restored)' : ` (restored ${n})`
      const candidate = `${dir}${stem}${suffix}${ext}`
      if (!(await exists(candidate))) return candidate
    }
    throw new Error('restore-target-exhausted')
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

/** Characters Windows forbids in a file/folder name (`\` too: segments are '/'-separated). */
// biome-ignore lint/suspicious/noControlCharactersInRegex: control chars are invalid in names
const INVALID_NAME_CHARS = /[<>:"|?*\\\u0000-\u001f]/
/** Windows reserved device names (with or without an extension). */
const RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i

/**
 * Rejects (`invalid-name`) a vault-relative path any of whose segments is not a
 * portable file name: Windows-forbidden characters (a `:` would otherwise create
 * an NTFS alternate data stream — a note that silently vanishes), reserved
 * device names, a trailing dot/space, or an empty segment.
 */
export function assertValidName(relPath: string): void {
  for (const seg of relPath.split('/')) {
    if (
      seg === '' ||
      seg === '.' ||
      seg === '..' ||
      INVALID_NAME_CHARS.test(seg) ||
      RESERVED_NAME.test(seg) ||
      /[. ]$/.test(seg)
    ) {
      throw new Error('invalid-name')
    }
  }
}

/** Errors Windows reports while another process (antivirus, search indexer) briefly holds a file. */
const TRANSIENT_FS_ERRORS = new Set(['EPERM', 'EACCES', 'EBUSY'])

/** Back-off (ms) between attempts of {@link replaceWithTemp}: ~2.5 s in total. */
const REPLACE_RETRY_DELAYS_MS = [20, 40, 80, 160, 250, 400, 600, 900]

type RenameDeps = { rename: typeof rename; sleep: (ms: number) => Promise<void> }
const defaultRenameDeps: RenameDeps = {
  rename,
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
}

/**
 * `rename` that rides out Windows' transient sharing locks. Right after a file
 * is created, written or renamed, Defender / the search indexer briefly open it
 * and `MoveFileEx` fails with EPERM/EACCES/EBUSY (a save right after a rename
 * failed ~1 in 4 times in E2E). Those are retried with back-off; any other
 * error, or a lock that outlasts the retries, is thrown.
 */
export async function renameRetrying(
  from: string,
  to: string,
  deps: RenameDeps = defaultRenameDeps,
): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await deps.rename(from, to)
      return
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code ?? ''
      if (!TRANSIENT_FS_ERRORS.has(code) || attempt >= REPLACE_RETRY_DELAYS_MS.length) throw err
      await deps.sleep(REPLACE_RETRY_DELAYS_MS[attempt])
    }
  }
}

/**
 * Renames a fully written temp file over `dest` (the atomic-write commit),
 * retrying transient locks; on failure the temp file is removed.
 */
export async function replaceWithTemp(
  tmp: string,
  dest: string,
  deps: RenameDeps = defaultRenameDeps,
): Promise<void> {
  try {
    await renameRetrying(tmp, dest, deps)
  } catch (err) {
    await unlink(tmp).catch(() => undefined)
    throw err
  }
}

/**
 * True when something other than `fromAbs` itself lives at `toAbs`. On a
 * case-insensitive file system a case-only rename's target resolves to the
 * source; comparing file identity (dev + inode) lets that rename through.
 */
async function occupiedByOther(fromAbs: string, toAbs: string): Promise<boolean> {
  let target: BigIntStats
  try {
    target = await stat(toAbs, { bigint: true })
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw err
  }
  if (fromAbs.toLowerCase() !== toAbs.toLowerCase()) return true
  const source = await stat(fromAbs, { bigint: true })
  return source.ino !== target.ino || source.dev !== target.dev
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

/** Removes an absolute path: permanently, or into the OS recycle bin (injected). */
export type Remover = (absPath: string) => Promise<void>

const rmRf: Remover = (absPath) => rm(absPath, { recursive: true, force: true })

/** Removes a trash item dir: `rm -rf` for a copy, the OS trash for an only copy. */
async function removeTrashDir(
  dir: string,
  item: TrashItem | null,
  osTrash: Remover | undefined,
): Promise<void> {
  if (item?.osTrashed === true || osTrash === undefined) return rmRf(dir)
  try {
    await osTrash(dir)
  } catch (err) {
    console.error('OS trash failed, deleting trash item instead:', err)
    await rmRf(dir)
  }
}

/** In-vault trash directory name. Dot-prefixed, so every vault walker skips it. */
export const TRASH_DIR = '.trash'

/** Trash item ids are generated as `<ms>-<hex>`; anything else is rejected (no traversal). */
const TRASH_ID_RE = /^\d+-[0-9a-f]+$/

function normalizeRel(relPath: string): string {
  return relPath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
}

function isTrashPath(rel: string): boolean {
  return rel === TRASH_DIR || rel.startsWith(`${TRASH_DIR}/`)
}

/** Splits a note filename into stem + extension, keeping `.md.enc` together. */
function splitNoteExt(name: string): [string, string] {
  const m = /(\.[^./]+(?:\.enc)?)$/i.exec(name)
  if (m === null || m.index === 0) return [name, '']
  return [name.slice(0, m.index), m[1]]
}

async function writeMeta(itemDir: string, item: TrashItem): Promise<void> {
  await writeFile(join(itemDir, 'meta.json'), JSON.stringify(item, null, 2), 'utf-8')
}

async function readMeta(itemDir: string): Promise<TrashItem | null> {
  try {
    const raw = JSON.parse(await readFile(join(itemDir, 'meta.json'), 'utf-8')) as TrashItem
    if (
      typeof raw.id !== 'string' ||
      (raw.kind !== 'note' && raw.kind !== 'folder') ||
      typeof raw.name !== 'string' ||
      typeof raw.originalPath !== 'string' ||
      typeof raw.deletedAt !== 'string' ||
      raw.name.includes('/') ||
      raw.name.includes('\\') ||
      raw.name === '..' ||
      raw.name === '.'
    ) {
      return null
    }
    return raw
  } catch {
    return null
  }
}

/** A locked note's display title: strip `.enc` and the note extension. `a/b.md.enc` -> `b`. */
function lockedNoteTitle(relPath: string): string {
  const base = relPath.split('/').pop() ?? relPath
  return base.slice(0, -ENC_SUFFIX.length).replace(/\.\w+$/, '')
}
