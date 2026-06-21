import { resolve } from 'node:path'
import type { IpcChannel, IpcRequest, IpcResponse, IpcResult } from '@shared/ipc'
import { type BrowserWindow, dialog, type IpcMain, type IpcMainInvokeEvent, shell } from 'electron'
import type { AttachmentService } from '../services/AttachmentService'
import type { IndexService } from '../services/IndexService'
import { reconcileIndex } from '../services/reconcile'
import type { SearchService } from '../services/SearchService'
import type { SettingsService } from '../services/SettingsService'
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
    'dialog:pickFolder': async () => {
      const win = deps.getMainWindow()
      const result = win
        ? await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
        : await dialog.showOpenDialog({ properties: ['openDirectory'] })
      if (result.canceled || result.filePaths.length === 0) return null
      return result.filePaths[0]
    },
    'vault:listNotes': async () => (await vault()).listNotes(),
    'vault:listDetailed': async () => (await vault()).listNotesDetailed(),
    'vault:readNote': async (path) => (await vault()).readNote(path),
    'vault:writeNote': async (req) => {
      const v = await vault()
      await v.writeNote(req.path, req.content)
      try {
        deps.index.indexNote(req.path, req.content, await v.statMtime(req.path))
      } catch (err) {
        console.error('index writeNote failed:', err)
      }
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
      return undefined
    },
    'vault:deleteNote': async (path) => {
      await (await vault()).deleteNote(path)
      tryIndex('deleteNote', () => deps.index.removeNote(path))
      return undefined
    },
    'vault:createFolder': async (path) => {
      await (await vault()).createFolder(path)
      return undefined
    },
    'vault:renameNote': async (req) => {
      await (await vault()).renameNote(req.from, req.to)
      tryIndex('renameNote', () => deps.index.renameNote(req.from, req.to))
      return undefined
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
      // Notify main window to refresh file list
      const mainWin = deps.getMainWindow()
      if (mainWin && !mainWin.isDestroyed()) {
        mainWin.webContents.send('vault:filesChanged')
      }
      return { path: filename }
    },
    'capture:close': () => {
      deps.windowManager.closeQuickCapture()
      return undefined
    },
    'index:rebuild': async () => {
      const v = await vault()
      const files = await v.listNotesWithMtime()
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
  register(ipc, 'dialog:pickFolder', handlers['dialog:pickFolder'])
  register(ipc, 'vault:listNotes', handlers['vault:listNotes'])
  register(ipc, 'vault:listDetailed', handlers['vault:listDetailed'])
  register(ipc, 'vault:readNote', handlers['vault:readNote'])
  register(ipc, 'vault:writeNote', handlers['vault:writeNote'])
  register(ipc, 'vault:createNote', handlers['vault:createNote'])
  register(ipc, 'vault:deleteNote', handlers['vault:deleteNote'])
  register(ipc, 'vault:createFolder', handlers['vault:createFolder'])
  register(ipc, 'vault:renameNote', handlers['vault:renameNote'])
  register(ipc, 'search:query', handlers['search:query'])
  register(ipc, 'tags:list', handlers['tags:list'])
  register(ipc, 'tags:notesForTag', handlers['tags:notesForTag'])
  register(ipc, 'attachment:store', handlers['attachment:store'])
  register(ipc, 'attachment:open', handlers['attachment:open'])
  register(ipc, 'capture:save', handlers['capture:save'])
  register(ipc, 'capture:close', handlers['capture:close'])
  register(ipc, 'index:rebuild', handlers['index:rebuild'])
  register(ipc, 'window:minimize', handlers['window:minimize'])
  register(ipc, 'window:toggleMaximize', handlers['window:toggleMaximize'])
  register(ipc, 'window:close', handlers['window:close'])
  register(ipc, 'window:forceClose', handlers['window:forceClose'])
  register(ipc, 'window:isMaximized', handlers['window:isMaximized'])
}
