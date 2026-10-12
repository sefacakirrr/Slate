import { resolve } from 'node:path'
import type { IpcChannel, IpcRequest, IpcResponse, IpcResult } from '@shared/ipc'
import type { Language, ReminderRecord } from '@shared/types'
import {
  app,
  type BrowserWindow,
  dialog,
  type IpcMain,
  type IpcMainInvokeEvent,
  shell,
} from 'electron'
import { getMainLanguage, setMainLanguage, tm } from '../i18n'
import { sendToOsTrash } from '../osTrash'
import type { AttachmentService } from '../services/AttachmentService'
import type { EncryptionService } from '../services/EncryptionService'
import type { ExternalFileService } from '../services/ExternalFileService'
import { ImportService } from '../services/ImportService'
import type { IndexService } from '../services/IndexService'
import { MoveGate } from '../services/MoveGate'
import { createPathMapper, type PathChange, PLATFORM_CASE_INSENSITIVE } from '../services/pathRemap'
import type { ReminderService } from '../services/ReminderService'
import { reconcileIndex } from '../services/reconcile'
import type { SearchService } from '../services/SearchService'
import type { SettingsService } from '../services/SettingsService'
import type { UpdateService } from '../services/UpdateService'
import { type Remover, VaultService } from '../services/VaultService'
import { applyLaunchAtLogin } from '../windows/loginItem'
import type { WindowManager } from '../windows/WindowManager'

/**
 * Service handler signature for a single IPC channel. Handlers throw on
 * failure; the IPC wrapper translates thrown errors into `IpcResult.error`.
 */
type Handler<K extends IpcChannel> = (
  request: IpcRequest<K>,
) => Promise<IpcResponse<K>> | IpcResponse<K>

type HandlerMap = { [K in IpcChannel]: Handler<K> }

/** Dependencies the handlers delegate to, injected by main. */
type Deps = {
  settings: SettingsService
  index: IndexService
  search: SearchService
  attachment: AttachmentService
  encryption: EncryptionService
  /** Allowlisted external (outside-vault) files opened by the user. */
  external: ExternalFileService
  update: UpdateService
  reminder: ReminderService
  windowManager: WindowManager
  /** The window the native dialogs should attach to, if any. */
  getMainWindow: () => BrowserWindow | null
  /** Rebuilds main-process UI (tray, app menu) and tells every window after a language switch. */
  onLanguageChanged?: (language: Language) => void
  /** Sends a path to the OS recycle bin. Injectable for tests; defaults to `shell.trashItem`. */
  osTrash?: Remover
}

function buildHandlers(deps: Deps): HandlerMap {
  const osTrash = deps.osTrash ?? sendToOsTrash
  // Lazily build and cache a VaultService for the current vault path. Rebuilt
  // when the path changes (e.g. user re-picks the vault in settings).
  let cached: { path: string; service: VaultService } | null = null
  const vault = async (): Promise<VaultService> => {
    const path = await deps.settings.getVaultPath()
    if (path === null) throw new Error('no-vault')
    if (cached === null || cached.path !== path) {
      cached = { path, service: new VaultService(path) }
    }
    return cached.service
  }

  // Index updates are best-effort: a failing index write must never fail the
  // user's vault mutation (the file on disk is the source of truth; the index
  // self-heals at next launch via reconciliation). Log and swallow.
  const tryIndex = (label: string, fn: () => void): void => {
    try {
      fn()
    } catch (err) {
      console.error(`index ${label} failed:`, err)
    }
  }

  // Note writes vs. path moves: a write never runs mid-move, and a write that
  // targets a just-moved path is redirected (see `vault:writeNote`).
  const gate = new MoveGate()

  // Main-owned data keyed by vault-relative note path follows every successful
  // move (rename, drag-move, lock/unlock, folder rename/move): reminders and
  // sticky windows. Workspace tabs and the sidebar order are re-keyed by their
  // owners. Must run before `broadcastFilesChanged`, so a sticky learns its new
  // path before it re-checks that its note still exists. Best-effort: the move
  // already happened on disk, so a failure here is logged, not thrown.
  const followPathChange = async (change: PathChange): Promise<void> => {
    const map = createPathMapper(change, PLATFORM_CASE_INSENSITIVE)
    await deps.reminder
      .remapPaths(map)
      .catch((err) => console.error('reminder remapPaths failed:', err))
    // Locked notes can't be stickies (lockNote closes the sticky itself), and a
    // late plaintext write must never be redirected into a locked note.
    if (change.kind === 'file' && deps.encryption.isLocked(change.to)) return
    gate.recordMove(map)
    await deps.windowManager
      .remapStickies(map)
      .catch((err) => console.error('remapStickies failed:', err))
  }

  return {
    'settings:getVaultPath': () => deps.settings.getVaultPath(),
    'settings:setVaultPath': async (path) => {
      await deps.settings.setVaultPath(path)
      // Rebuild the search index for the new vault (best-effort, non-blocking).
      reconcileIndex(new VaultService(path), deps.index).catch((err) =>
        console.error('reconcile after vault change failed:', err),
      )
      return undefined
    },
    'settings:getWorkspace': () => deps.settings.getWorkspace(),
    'settings:setWorkspace': async (ws) => {
      await deps.settings.setWorkspace(ws)
      // Persist only allowlisted external tabs that are still open, so they
      // can be restored next launch (the renderer can shrink, never grow, this).
      await deps.settings.setExternalFiles(deps.external.persistable(ws.openTabs))
      return undefined
    },
    'settings:getTheme': () => deps.settings.getTheme(),
    'settings:setTheme': async (theme) => {
      await deps.settings.setTheme(theme)
      deps.windowManager.broadcastThemeChanged(theme)
      return undefined
    },
    'settings:getAutoSave': () => deps.settings.getAutoSave(),
    'settings:setAutoSave': async (autoSave) => {
      await deps.settings.setAutoSave(autoSave)
      return undefined
    },
    'settings:getNoteOrder': () => deps.settings.getNoteOrder(),
    'settings:setNoteOrder': async (req) => {
      await deps.settings.setNoteOrder(req.folder, req.names)
      return undefined
    },
    'settings:getLaunchAtLogin': () => deps.settings.getLaunchAtLogin(),
    'settings:setLaunchAtLogin': async (enabled) => {
      await deps.settings.setLaunchAtLogin(enabled)
      applyLaunchAtLogin(enabled)
      return undefined
    },
    'settings:getCloseToTray': () => deps.settings.getCloseToTray(),
    'settings:setCloseToTray': async (enabled) => {
      await deps.settings.setCloseToTray(enabled)
      deps.windowManager.setCloseToTray(enabled)
      return undefined
    },
    'settings:getLanguage': () => getMainLanguage(),
    'settings:setLanguage': async (language) => {
      if (language !== 'en' && language !== 'tr') throw new Error('invalid-language')
      await deps.settings.setLanguage(language)
      setMainLanguage(language)
      deps.onLanguageChanged?.(language)
      return undefined
    },
    'settings:getFontSize': () => deps.settings.getFontSize(),
    'settings:setFontSize': async (size) => {
      await deps.settings.setFontSize(size)
      return undefined
    },
    'dialog:pickFolder': async () => {
      const win = deps.getMainWindow()
      const result = win
        ? await dialog.showOpenDialog(win, {
            title: tm('dialog.pickVault'),
            properties: ['openDirectory'],
          })
        : await dialog.showOpenDialog({
            title: tm('dialog.pickVault'),
            properties: ['openDirectory'],
          })
      if (result.canceled || result.filePaths.length === 0) return null
      return result.filePaths[0]
    },
    'vault:listNotes': async () => (await vault()).listNotes(),
    'vault:listDirs': async () => (await vault()).listDirs(),
    'vault:listDetailed': async () => (await vault()).listNotesDetailed(),
    'vault:readNote': async (path) => {
      const v = await vault()
      // A locked note requires an unlocked vault; return decrypted plaintext.
      if (deps.encryption.isLocked(path)) {
        if (!deps.encryption.isUnlocked()) throw new Error('note-locked')
        return deps.encryption.openForSession(await v.readBytes(path))
      }
      return v.readNote(path)
    },
    // Runs outside any move. A write for a path that no longer exists either
    // follows a just-completed move (a save sent before its window learned the
    // new path) or — when the note was locked — is refused: plaintext must never
    // land next to its `.enc` twin.
    'vault:writeNote': (req) =>
      gate.runWrite(async () => {
        const v = await vault()
        let path = req.path
        if (!(await pathTaken(v, path))) {
          const moved = gate.redirect(path)
          if (moved !== path && (await pathTaken(v, moved))) path = moved
          else if (!deps.encryption.isLocked(path) && (await pathTaken(v, `${path}.enc`))) {
            throw new Error('note-locked')
          }
        }
        // A locked note is encrypted before hitting disk and never indexed (its
        // plaintext must not enter the FTS index).
        if (deps.encryption.isLocked(path)) {
          if (!deps.encryption.isUnlocked()) throw new Error('note-locked')
          await v.writeBytes(path, deps.encryption.sealForSession(req.content))
          deps.windowManager.broadcastFilesChanged()
          deps.windowManager.broadcastNoteChanged(path)
          return undefined
        }
        await v.writeNote(path, req.content)
        try {
          deps.index.indexNote(path, req.content, await v.statMtime(path))
        } catch (err) {
          console.error('index writeNote failed:', err)
        }
        deps.windowManager.broadcastFilesChanged()
        // Content changed → let other windows showing this note reload (if not dirty).
        deps.windowManager.broadcastNoteChanged(path)
        return undefined
      }),
    'vault:createNote': async (path) => {
      const v = await vault()
      await v.createNote(path)
      try {
        deps.index.indexNote(path, '', await v.statMtime(path))
      } catch (err) {
        console.error('index createNote failed:', err)
      }
      deps.windowManager.broadcastFilesChanged()
      return undefined
    },
    // User-initiated deletes: a copy goes to the in-vault trash (Undo / Trash
    // view) and the original to the OS recycle bin. Internal file replacement
    // (lock/unlock) keeps using the hard `v.deleteNote`.
    'vault:deleteNote': async (path) => {
      const item = await (await vault()).moveToTrash(path, 'note', osTrash)
      tryIndex('deleteNote', () => deps.index.removeNote(path))
      deps.windowManager.broadcastFilesChanged()
      return item
    },
    'vault:deleteFolder': async (path) => {
      const v = await vault()
      const allNotes = await v.listNotes()
      const prefix = `${path}/`
      const toRemove = allNotes.filter((p) => p === path || p.startsWith(prefix))
      const item = await v.moveToTrash(path, 'folder', osTrash)
      for (const p of toRemove) {
        tryIndex('deleteFolder/removeNote', () => deps.index.removeNote(p))
      }
      deps.windowManager.broadcastFilesChanged()
      return item
    },
    'vault:listTrash': async () => (await vault()).listTrash(),
    'vault:restoreTrash': async (id) => {
      const v = await vault()
      const restored = await v.restoreFromTrash(id)
      // Same indexing as a written note; locked notes stay out of the FTS index.
      for (const p of restored.notes) {
        if (deps.encryption.isLocked(p)) continue
        try {
          deps.index.indexNote(p, await v.readNote(p), await v.statMtime(p))
        } catch (err) {
          console.error('index restoreTrash failed:', err)
        }
      }
      deps.windowManager.broadcastFilesChanged()
      return { path: restored.path }
    },
    // When the original already went to the OS recycle bin at delete time, the
    // in-vault copy is removed outright (no duplicate in the recycle bin); an
    // item holding the only copy (OS trash failed / legacy) goes to the OS trash.
    'vault:deleteTrashItem': async (id) => {
      await (await vault()).deleteTrashItem(id, osTrash)
      return undefined
    },
    'vault:emptyTrash': async () => {
      await (await vault()).emptyTrash(osTrash)
      return undefined
    },
    'vault:createFolder': async (path) => {
      await (await vault()).createFolder(path)
      return undefined
    },
    'vault:renameNote': (req) =>
      gate.runMove(async () => {
        await (await vault()).renameNote(req.from, req.to)
        tryIndex('renameNote', () => deps.index.renameNote(req.from, req.to))
        await followPathChange({ kind: 'file', from: req.from, to: req.to })
        deps.windowManager.broadcastFilesChanged()
        return undefined
      }),
    'vault:renameFolder': (req) =>
      gate.runMove(async () => {
        const v = await vault()
        const allNotes = await v.listNotes()
        const fromPrefix = `${req.from}/`
        const movedNotes = allNotes.filter((p) => p.startsWith(fromPrefix))
        await v.renameFolder(req.from, req.to)
        const toPrefix = `${req.to}/`
        for (const p of movedNotes) {
          const newPath = toPrefix + p.slice(fromPrefix.length)
          tryIndex('renameFolder/renameNote', () => deps.index.renameNote(p, newPath))
        }
        // The folder's custom sidebar order (drag-reorder) follows it.
        await deps.settings
          .moveNoteOrderFolder(req.from, req.to)
          .catch((err) => console.error('moveNoteOrderFolder failed:', err))
        await followPathChange({ kind: 'folder', from: req.from, to: req.to })
        deps.windowManager.broadcastFilesChanged()
        return undefined
      }),
    'vault:hasPassword': async () => (await deps.settings.getEncryption()) !== null,
    'vault:setPassword': async (req) => {
      // First-time only in v1 — changing the password (re-encrypt all) is out of scope.
      if ((await deps.settings.getEncryption()) !== null) throw new Error('password-exists')
      const secret = deps.encryption.initPassword(req.password)
      try {
        await deps.settings.setEncryption(secret)
        if (req.hint) await deps.settings.setPasswordHint(req.hint)
      } catch (err) {
        deps.encryption.lockVault()
        throw err
      }
      return undefined
    },
    'vault:unlock': async (req) => {
      const secret = await deps.settings.getEncryption()
      if (secret === null) throw new Error('no-password')
      return deps.encryption.unlock(req.password, secret)
    },
    'vault:getPasswordHint': () => deps.settings.getPasswordHint(),
    'vault:lockVault': () => {
      deps.encryption.lockVault()
      return undefined
    },
    'vault:isVaultUnlocked': () => deps.encryption.isUnlocked(),
    'vault:isLocked': (path) => deps.encryption.isLocked(path),
    'vault:lockNote': (path) =>
      gate.runMove(async () => {
        if (deps.encryption.isLocked(path)) throw new Error('already-locked')
        if (!deps.encryption.isUnlocked()) throw new Error('vault-locked')
        const v = await vault()
        const encPath = `${path}.enc`
        // Never overwrite another locked note that already owns the target name.
        if (await pathTaken(v, encPath)) throw new Error('file-exists')
        // A sticky on this note: take its unsaved draft into the file first (so
        // the edits are encrypted too), then close it without its save-on-close
        // — nothing may write plaintext back once the note is locked.
        const stickyDraft = await deps.windowManager.takeStickyDraft(path)
        if (stickyDraft !== null) await v.writeNote(path, stickyDraft)
        deps.windowManager.destroySticky(path)
        const plaintext = await v.readNote(path)
        // encrypt → write → verify it re-opens → only then delete the plaintext,
        // so we never destroy the original before a good ciphertext exists.
        await v.writeBytes(encPath, deps.encryption.sealForSession(plaintext))
        if (deps.encryption.openForSession(await v.readBytes(encPath)) !== plaintext) {
          throw new Error('lock-verify-failed')
        }
        await v.deleteNote(path)
        // Remove the now-encrypted note from the search index (security boundary).
        tryIndex('lockNote', () => deps.index.removeNote(path))
        // Reminders follow to `.enc` (the sticky was closed above).
        await followPathChange({ kind: 'file', from: path, to: encPath })
        deps.windowManager.broadcastFilesChanged()
        return { path: encPath }
      }),
    'vault:unlockNote': (path) =>
      gate.runMove(async () => {
        if (!deps.encryption.isLocked(path)) throw new Error('not-locked')
        if (!deps.encryption.isUnlocked()) throw new Error('vault-locked')
        const v = await vault()
        const plaintext = deps.encryption.openForSession(await v.readBytes(path))
        const plainPath = path.slice(0, -'.enc'.length)
        // Never overwrite a plaintext note that already owns the target name.
        if (await pathTaken(v, plainPath)) throw new Error('file-exists')
        await v.writeNote(plainPath, plaintext)
        await v.deleteNote(path)
        // Back in plaintext → re-index so it's searchable again.
        try {
          deps.index.indexNote(plainPath, plaintext, await v.statMtime(plainPath))
        } catch (err) {
          console.error('index unlockNote failed:', err)
        }
        await followPathChange({ kind: 'file', from: path, to: plainPath })
        deps.windowManager.broadcastFilesChanged()
        return { path: plainPath }
      }),
    'search:query': (query) => deps.search.search(query),
    'tags:list': () => deps.index.listTags(),
    'tags:notesForTag': (tag) => deps.index.notesForTag(tag),
    'attachment:store': async (req) => {
      const buffer = Buffer.from(req.data, 'base64')
      const result = await deps.attachment.store(buffer, req.name)
      return { relativePath: result.relativePath }
    },
    'attachment:open': async (relativePath) => {
      const vaultPath = await deps.settings.getVaultPath()
      if (!vaultPath) throw new Error('no-vault')
      const absPath = resolve(vaultPath, relativePath)
      await shell.openPath(absPath)
      return undefined
    },
    'capture:save': async (req) => {
      const v = await vault()
      const now = new Date()
      const pad = (n: number) => String(n).padStart(2, '0')
      const filename = `quick-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.md`
      await v.createNote(filename)
      await v.writeNote(filename, req.content)
      try {
        deps.index.indexNote(filename, req.content, await v.statMtime(filename))
      } catch (err) {
        console.error('index capture:save failed:', err)
      }
      deps.windowManager.closeQuickCapture()
      // Refresh every window's file list (main + any stickies).
      deps.windowManager.broadcastFilesChanged()
      return { path: filename }
    },
    'capture:close': () => {
      deps.windowManager.closeQuickCapture()
      return undefined
    },
    'index:rebuild': async () => {
      const v = await vault()
      // Exclude locked notes: their content is encrypted and must never enter the
      // FTS index. `listNotesWithMtime` includes `.md.enc` files, so filter them
      // out before reading — otherwise a manual rebuild would index ciphertext
      // and re-open the search-leak boundary that lock/reconcile close.
      const files = (await v.listNotesWithMtime()).filter((f) => !deps.encryption.isLocked(f.path))
      const entries = await Promise.all(
        files.map(async (f) => ({
          path: f.path,
          mtime: f.mtime,
          content: await v.readNote(f.path),
        })),
      )
      deps.index.rebuild(entries)
      return undefined
    },
    'window:sticky:open': (path) => {
      // Locked notes are excluded from stickies in v1 (a floating window can't sit
      // behind a password prompt). Defense in depth — the UI also hides the action.
      if (deps.encryption.isLocked(path)) throw new Error('cannot-pin-locked')
      deps.windowManager.openSticky(path)
      return undefined
    },
    'window:sticky:close': (path) => {
      deps.windowManager.closeSticky(path)
      return undefined
    },
    'window:sticky:flushed': (req) => {
      deps.windowManager.resolveStickyDraft(req.id, req.draft)
      return undefined
    },
    'update:check': () => {
      deps.update.check()
      return undefined
    },
    'update:install': () => {
      deps.update.install()
      return undefined
    },
    'update:openReleases': async (url) => {
      await deps.update.openReleases(url)
      return undefined
    },
    'window:minimize': () => {
      deps.getMainWindow()?.minimize()
      return undefined
    },
    'window:toggleMaximize': () => {
      const win = deps.getMainWindow()
      if (win === null) return false
      if (win.isMaximized()) win.unmaximize()
      else win.maximize()
      return win.isMaximized()
    },
    'window:close': () => {
      deps.getMainWindow()?.close()
      return undefined
    },
    'window:forceClose': () => {
      deps.windowManager.forceCloseMain()
      return undefined
    },
    'window:cancelQuit': () => {
      deps.windowManager.cancelQuit()
      return undefined
    },
    'window:isMaximized': () => deps.getMainWindow()?.isMaximized() ?? false,
    'import:pickSource': async (req) => {
      const win = deps.getMainWindow()
      // Start where people actually keep loose notes (Desktop), not the cwd.
      const defaultPath = app.getPath('desktop')
      const options: Electron.OpenDialogOptions =
        req.kind === 'folder'
          ? { title: tm('dialog.pickImportFolder'), properties: ['openDirectory'], defaultPath }
          : {
              title: tm('dialog.pickImportZip'),
              properties: ['openFile'],
              defaultPath,
              filters: [{ name: tm('dialog.notionExport'), extensions: ['zip'] }],
            }
      const result = win
        ? await dialog.showOpenDialog(win, options)
        : await dialog.showOpenDialog(options)
      if (result.canceled || result.filePaths.length === 0) return null
      return result.filePaths[0]
    },
    'import:scan': async (sourcePath) => new ImportService(await vault()).scan(sourcePath),
    'import:execute': async (req) => {
      const v = await vault()
      const importer = new ImportService(v)
      const result = await importer.execute(req, (p) => {
        const w = deps.getMainWindow()
        if (w && !w.isDestroyed()) w.webContents.send('import:progress', p)
      })
      // Imported files appeared on disk behind the index's back — reconcile so
      // they are searchable immediately (epic success criterion), then refresh
      // the file lists in every window.
      try {
        await reconcileIndex(v, deps.index)
      } catch (err) {
        console.error('reconcile after import failed:', err)
      }
      deps.windowManager.broadcastFilesChanged()
      return result
    },
    'reminder:list': () => deps.reminder.list(),
    'reminder:add': async (req) => {
      const reminder: ReminderRecord = {
        id: `rem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title: req.title,
        notePath: req.notePath,
        fireAt: req.fireAt,
        alertBefore: req.alertBefore,
        recurrence: req.recurrence,
        fired: false,
        createdAt: Date.now(),
      }
      await deps.reminder.add(reminder)
      return reminder
    },
    'reminder:takePending': () => deps.reminder.takePending(),
    'reminder:remove': async (id) => {
      await deps.reminder.remove(id)
      return undefined
    },
    'dailynotes:list': async (month) => {
      const v = await vault()
      const notes = await v.listNotes()
      return notes.filter((p) => {
        if (!p.startsWith('daily/')) return false
        const name = p.slice('daily/'.length).replace(/\.\w+$/, '')
        return name.startsWith(month)
      })
    },
    'external:read': (path) => deps.external.read(path),
    'external:write': async (req) => {
      await deps.external.write(req.path, req.content)
      return undefined
    },
    'external:resolveDropped': async (paths) =>
      deps.external.resolveOpen(
        Array.isArray(paths) ? paths : [],
        await deps.settings.getVaultPath(),
      ),
    'external:takePending': () => deps.external.takePending(),
    'dailynotes:open': async (date) => {
      const v = await vault()
      const path = `daily/${date}.md`
      try {
        await v.createFolder('daily')
      } catch {
        // folder already exists
      }
      try {
        await v.createNote(path)
        tryIndex('dailynotes:open', () => deps.index.indexNote(path, '', 0))
      } catch {
        // note already exists
      }
      deps.windowManager.broadcastFilesChanged()
      return path
    },
  }
}

/**
 * Wraps a service handler with try/catch and `IpcResult<T>` packaging, then
 * registers it with `ipcMain.handle`. Generic in `K` so request and response
 * types stay tied together per-channel.
 */
/** Whether a vault-relative path already exists. */
function pathTaken(v: VaultService, rel: string): Promise<boolean> {
  return v.statMtime(rel).then(
    () => true,
    () => false,
  )
}

function register<K extends IpcChannel>(ipc: IpcMain, channel: K, handler: Handler<K>): void {
  ipc.handle(
    channel,
    async (
      _event: IpcMainInvokeEvent,
      request: IpcRequest<K>,
    ): Promise<IpcResult<IpcResponse<K>>> => {
      try {
        const data = await handler(request)
        return { ok: true, data }
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        }
      }
    },
  )
}

export function registerIpcHandlers(ipc: IpcMain, deps: Deps): void {
  const handlers = buildHandlers(deps)
  register(ipc, 'settings:getVaultPath', handlers['settings:getVaultPath'])
  register(ipc, 'settings:setVaultPath', handlers['settings:setVaultPath'])
  register(ipc, 'settings:getWorkspace', handlers['settings:getWorkspace'])
  register(ipc, 'settings:setWorkspace', handlers['settings:setWorkspace'])
  register(ipc, 'settings:getTheme', handlers['settings:getTheme'])
  register(ipc, 'settings:setTheme', handlers['settings:setTheme'])
  register(ipc, 'settings:getAutoSave', handlers['settings:getAutoSave'])
  register(ipc, 'settings:setAutoSave', handlers['settings:setAutoSave'])
  register(ipc, 'settings:getNoteOrder', handlers['settings:getNoteOrder'])
  register(ipc, 'settings:setNoteOrder', handlers['settings:setNoteOrder'])
  register(ipc, 'settings:getFontSize', handlers['settings:getFontSize'])
  register(ipc, 'settings:getLaunchAtLogin', handlers['settings:getLaunchAtLogin'])
  register(ipc, 'settings:setLaunchAtLogin', handlers['settings:setLaunchAtLogin'])
  register(ipc, 'settings:getCloseToTray', handlers['settings:getCloseToTray'])
  register(ipc, 'settings:setCloseToTray', handlers['settings:setCloseToTray'])
  register(ipc, 'settings:setFontSize', handlers['settings:setFontSize'])
  register(ipc, 'settings:getLanguage', handlers['settings:getLanguage'])
  register(ipc, 'settings:setLanguage', handlers['settings:setLanguage'])
  register(ipc, 'dialog:pickFolder', handlers['dialog:pickFolder'])
  register(ipc, 'vault:listNotes', handlers['vault:listNotes'])
  register(ipc, 'vault:listDirs', handlers['vault:listDirs'])
  register(ipc, 'vault:listDetailed', handlers['vault:listDetailed'])
  register(ipc, 'vault:readNote', handlers['vault:readNote'])
  register(ipc, 'vault:writeNote', handlers['vault:writeNote'])
  register(ipc, 'vault:createNote', handlers['vault:createNote'])
  register(ipc, 'vault:deleteNote', handlers['vault:deleteNote'])
  register(ipc, 'vault:deleteFolder', handlers['vault:deleteFolder'])
  register(ipc, 'vault:listTrash', handlers['vault:listTrash'])
  register(ipc, 'vault:restoreTrash', handlers['vault:restoreTrash'])
  register(ipc, 'vault:deleteTrashItem', handlers['vault:deleteTrashItem'])
  register(ipc, 'vault:emptyTrash', handlers['vault:emptyTrash'])
  register(ipc, 'vault:createFolder', handlers['vault:createFolder'])
  register(ipc, 'vault:renameNote', handlers['vault:renameNote'])
  register(ipc, 'vault:renameFolder', handlers['vault:renameFolder'])
  register(ipc, 'vault:hasPassword', handlers['vault:hasPassword'])
  register(ipc, 'vault:setPassword', handlers['vault:setPassword'])
  register(ipc, 'vault:unlock', handlers['vault:unlock'])
  register(ipc, 'vault:getPasswordHint', handlers['vault:getPasswordHint'])
  register(ipc, 'vault:lockVault', handlers['vault:lockVault'])
  register(ipc, 'vault:isVaultUnlocked', handlers['vault:isVaultUnlocked'])
  register(ipc, 'vault:isLocked', handlers['vault:isLocked'])
  register(ipc, 'vault:lockNote', handlers['vault:lockNote'])
  register(ipc, 'vault:unlockNote', handlers['vault:unlockNote'])
  register(ipc, 'search:query', handlers['search:query'])
  register(ipc, 'tags:list', handlers['tags:list'])
  register(ipc, 'tags:notesForTag', handlers['tags:notesForTag'])
  register(ipc, 'attachment:store', handlers['attachment:store'])
  register(ipc, 'attachment:open', handlers['attachment:open'])
  register(ipc, 'capture:save', handlers['capture:save'])
  register(ipc, 'capture:close', handlers['capture:close'])
  register(ipc, 'index:rebuild', handlers['index:rebuild'])
  register(ipc, 'window:sticky:open', handlers['window:sticky:open'])
  register(ipc, 'window:sticky:close', handlers['window:sticky:close'])
  register(ipc, 'window:sticky:flushed', handlers['window:sticky:flushed'])
  register(ipc, 'update:check', handlers['update:check'])
  register(ipc, 'update:install', handlers['update:install'])
  register(ipc, 'update:openReleases', handlers['update:openReleases'])
  register(ipc, 'window:minimize', handlers['window:minimize'])
  register(ipc, 'window:toggleMaximize', handlers['window:toggleMaximize'])
  register(ipc, 'window:close', handlers['window:close'])
  register(ipc, 'window:forceClose', handlers['window:forceClose'])
  register(ipc, 'window:cancelQuit', handlers['window:cancelQuit'])
  register(ipc, 'window:isMaximized', handlers['window:isMaximized'])
  register(ipc, 'import:pickSource', handlers['import:pickSource'])
  register(ipc, 'import:scan', handlers['import:scan'])
  register(ipc, 'import:execute', handlers['import:execute'])
  register(ipc, 'reminder:list', handlers['reminder:list'])
  register(ipc, 'reminder:add', handlers['reminder:add'])
  register(ipc, 'reminder:remove', handlers['reminder:remove'])
  register(ipc, 'reminder:takePending', handlers['reminder:takePending'])
  register(ipc, 'dailynotes:list', handlers['dailynotes:list'])
  register(ipc, 'dailynotes:open', handlers['dailynotes:open'])
  register(ipc, 'external:read', handlers['external:read'])
  register(ipc, 'external:write', handlers['external:write'])
  register(ipc, 'external:resolveDropped', handlers['external:resolveDropped'])
  register(ipc, 'external:takePending', handlers['external:takePending'])
}
