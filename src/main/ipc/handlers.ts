import { resolve } from 'node:path'
import type { IpcChannel, IpcRequest, IpcResponse, IpcResult } from '@shared/ipc'
import { type BrowserWindow, dialog, type IpcMain, type IpcMainInvokeEvent, shell } from 'electron'
import type { AttachmentService } from '../services/AttachmentService'
import type { EncryptionService } from '../services/EncryptionService'
import { ImportService } from '../services/ImportService'
import type { IndexService } from '../services/IndexService'
import { reconcileIndex } from '../services/reconcile'
import type { SearchService } from '../services/SearchService'
import type { SettingsService } from '../services/SettingsService'
import type { UpdateService } from '../services/UpdateService'
import { VaultService } from '../services/VaultService'
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
  update: UpdateService
  windowManager: WindowManager
  /** The window the native dialogs should attach to, if any. */
  getMainWindow: () => BrowserWindow | null
}

function buildHandlers(deps: Deps): HandlerMap {
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
      return undefined
    },
    'settings:getTheme': () => deps.settings.getTheme(),
    'settings:setTheme': async (theme) => {
      await deps.settings.setTheme(theme)
      return undefined
    },
    'settings:getAutoSave': () => deps.settings.getAutoSave(),
    'settings:setAutoSave': async (autoSave) => {
      await deps.settings.setAutoSave(autoSave)
      return undefined
    },
    'dialog:pickFolder': async () => {
      const win = deps.getMainWindow()
      const result = win
        ? await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
        : await dialog.showOpenDialog({ properties: ['openDirectory'] })
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
    'vault:writeNote': async (req) => {
      const v = await vault()
      // A locked note is encrypted before hitting disk and never indexed (its
      // plaintext must not enter the FTS index).
      if (deps.encryption.isLocked(req.path)) {
        if (!deps.encryption.isUnlocked()) throw new Error('note-locked')
        await v.writeBytes(req.path, deps.encryption.sealForSession(req.content))
        deps.windowManager.broadcastFilesChanged()
        deps.windowManager.broadcastNoteChanged(req.path)
        return undefined
      }
      await v.writeNote(req.path, req.content)
      try {
        deps.index.indexNote(req.path, req.content, await v.statMtime(req.path))
      } catch (err) {
        console.error('index writeNote failed:', err)
      }
      deps.windowManager.broadcastFilesChanged()
      // Content changed → let other windows showing this note reload (if not dirty).
      deps.windowManager.broadcastNoteChanged(req.path)
      return undefined
    },
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
    'vault:deleteNote': async (path) => {
      await (await vault()).deleteNote(path)
      tryIndex('deleteNote', () => deps.index.removeNote(path))
      deps.windowManager.broadcastFilesChanged()
      return undefined
    },
    'vault:deleteFolder': async (path) => {
      const v = await vault()
      const allNotes = await v.listNotes()
      const prefix = path + '/'
      const toRemove = allNotes.filter((p) => p === path || p.startsWith(prefix))
      await v.deleteFolder(path)
      for (const p of toRemove) {
        tryIndex('deleteFolder/removeNote', () => deps.index.removeNote(p))
      }
      deps.windowManager.broadcastFilesChanged()
      return undefined
    },
    'vault:createFolder': async (path) => {
      await (await vault()).createFolder(path)
      return undefined
    },
    'vault:renameNote': async (req) => {
      await (await vault()).renameNote(req.from, req.to)
      tryIndex('renameNote', () => deps.index.renameNote(req.from, req.to))
      deps.windowManager.broadcastFilesChanged()
      return undefined
    },
    'vault:renameFolder': async (req) => {
      const v = await vault()
      const allNotes = await v.listNotes()
      const fromPrefix = req.from + '/'
      const movedNotes = allNotes.filter((p) => p.startsWith(fromPrefix))
      await v.renameFolder(req.from, req.to)
      const toPrefix = req.to + '/'
      for (const p of movedNotes) {
        const newPath = toPrefix + p.slice(fromPrefix.length)
        tryIndex('renameFolder/renameNote', () => deps.index.renameNote(p, newPath))
      }
      deps.windowManager.broadcastFilesChanged()
      return undefined
    },
    'vault:hasPassword': async () => (await deps.settings.getEncryption()) !== null,
    'vault:setPassword': async (req) => {
      // First-time only in v1 — changing the password (re-encrypt all) is out of scope.
      if ((await deps.settings.getEncryption()) !== null) throw new Error('password-exists')
      const secret = deps.encryption.initPassword(req.password)
      try {
        await deps.settings.setEncryption(secret)
      } catch (err) {
        // Persist failed: roll back the in-memory key so we never end up unlocked
        // with a salt that was never saved — locking a note in that state would
        // make it permanently unopenable (the salt to re-derive the key is gone).
        deps.encryption.lockVault()
        throw err
      }
      return undefined
    },
    'vault:unlock': async (req) => {
      const secret = await deps.settings.getEncryption()
      if (secret === null) throw new Error('no-password')
      // Returns false (not throws) on a wrong password so the renderer can retry.
      return deps.encryption.unlock(req.password, secret)
    },
    'vault:lockVault': () => {
      deps.encryption.lockVault()
      return undefined
    },
    'vault:isVaultUnlocked': () => deps.encryption.isUnlocked(),
    'vault:isLocked': (path) => deps.encryption.isLocked(path),
    'vault:lockNote': async (path) => {
      if (deps.encryption.isLocked(path)) throw new Error('already-locked')
      if (!deps.encryption.isUnlocked()) throw new Error('vault-locked')
      const v = await vault()
      const plaintext = await v.readNote(path)
      const encPath = `${path}.enc`
      // encrypt → write → verify it re-opens → only then delete the plaintext,
      // so we never destroy the original before a good ciphertext exists.
      await v.writeBytes(encPath, deps.encryption.sealForSession(plaintext))
      if (deps.encryption.openForSession(await v.readBytes(encPath)) !== plaintext) {
        throw new Error('lock-verify-failed')
      }
      await v.deleteNote(path)
      // Remove the now-encrypted note from the search index (security boundary).
      tryIndex('lockNote', () => deps.index.removeNote(path))
      // The note's path changed to `.enc` — refresh every window (a sticky on the
      // old path will re-check and close itself, since locked notes can't be stickies).
      deps.windowManager.broadcastFilesChanged()
      return { path: encPath }
    },
    'vault:unlockNote': async (path) => {
      if (!deps.encryption.isLocked(path)) throw new Error('not-locked')
      if (!deps.encryption.isUnlocked()) throw new Error('vault-locked')
      const v = await vault()
      const plaintext = deps.encryption.openForSession(await v.readBytes(path))
      const plainPath = path.slice(0, -'.enc'.length)
      await v.writeNote(plainPath, plaintext)
      await v.deleteNote(path)
      // Back in plaintext → re-index so it's searchable again.
      try {
        deps.index.indexNote(plainPath, plaintext, await v.statMtime(plainPath))
      } catch (err) {
        console.error('index unlockNote failed:', err)
      }
      deps.windowManager.broadcastFilesChanged()
      return { path: plainPath }
    },
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
    'window:isMaximized': () => deps.getMainWindow()?.isMaximized() ?? false,
    'import:pickSource': async (req) => {
      const win = deps.getMainWindow()
      const options: Electron.OpenDialogOptions =
        req.kind === 'folder'
          ? { properties: ['openDirectory'] }
          : {
              properties: ['openFile'],
              filters: [{ name: 'Notion export', extensions: ['zip'] }],
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
        deps.getMainWindow()?.webContents.send('import:progress', p)
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
  }
}

/**
 * Wraps a service handler with try/catch and `IpcResult<T>` packaging, then
 * registers it with `ipcMain.handle`. Generic in `K` so request and response
 * types stay tied together per-channel.
 */
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
  register(ipc, 'dialog:pickFolder', handlers['dialog:pickFolder'])
  register(ipc, 'vault:listNotes', handlers['vault:listNotes'])
  register(ipc, 'vault:listDirs', handlers['vault:listDirs'])
  register(ipc, 'vault:listDetailed', handlers['vault:listDetailed'])
  register(ipc, 'vault:readNote', handlers['vault:readNote'])
  register(ipc, 'vault:writeNote', handlers['vault:writeNote'])
  register(ipc, 'vault:createNote', handlers['vault:createNote'])
  register(ipc, 'vault:deleteNote', handlers['vault:deleteNote'])
  register(ipc, 'vault:deleteFolder', handlers['vault:deleteFolder'])
  register(ipc, 'vault:createFolder', handlers['vault:createFolder'])
  register(ipc, 'vault:renameNote', handlers['vault:renameNote'])
  register(ipc, 'vault:renameFolder', handlers['vault:renameFolder'])
  register(ipc, 'vault:hasPassword', handlers['vault:hasPassword'])
  register(ipc, 'vault:setPassword', handlers['vault:setPassword'])
  register(ipc, 'vault:unlock', handlers['vault:unlock'])
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
  register(ipc, 'update:check', handlers['update:check'])
  register(ipc, 'update:install', handlers['update:install'])
  register(ipc, 'update:openReleases', handlers['update:openReleases'])
  register(ipc, 'window:minimize', handlers['window:minimize'])
  register(ipc, 'window:toggleMaximize', handlers['window:toggleMaximize'])
  register(ipc, 'window:close', handlers['window:close'])
  register(ipc, 'window:forceClose', handlers['window:forceClose'])
  register(ipc, 'window:isMaximized', handlers['window:isMaximized'])
  register(ipc, 'import:pickSource', handlers['import:pickSource'])
  register(ipc, 'import:scan', handlers['import:scan'])
  register(ipc, 'import:execute', handlers['import:execute'])
}
