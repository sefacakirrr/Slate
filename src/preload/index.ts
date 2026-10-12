import type { Api, IpcChannel, IpcRequest, IpcResponse, IpcResult } from '@shared/ipc'
import { contextBridge, ipcRenderer, webUtils } from 'electron'

/**
 * Typed wrapper over `ipcRenderer.invoke`. All renderer-bound responses are
 * `IpcResult<T>` because the main-process IPC wrapper packages them that way.
 */
function invoke<K extends IpcChannel>(
  channel: K,
  request?: IpcRequest<K>,
): Promise<IpcResult<IpcResponse<K>>> {
  return ipcRenderer.invoke(channel, request)
}

const api: Api = {
  platform: process.platform,
  settings: {
    getVaultPath: () => invoke('settings:getVaultPath'),
    setVaultPath: (path) => invoke('settings:setVaultPath', path),
    getWorkspace: () => invoke('settings:getWorkspace'),
    setWorkspace: (ws) => invoke('settings:setWorkspace', ws),
    getTheme: () => invoke('settings:getTheme'),
    setTheme: (theme) => invoke('settings:setTheme', theme),
    getAutoSave: () => invoke('settings:getAutoSave'),
    setAutoSave: (autoSave) => invoke('settings:setAutoSave', autoSave),
    getNoteOrder: () => invoke('settings:getNoteOrder'),
    setNoteOrder: (req) => invoke('settings:setNoteOrder', req),
    getFontSize: () => invoke('settings:getFontSize'),
    setFontSize: (size) => invoke('settings:setFontSize', size),
    getLaunchAtLogin: () => invoke('settings:getLaunchAtLogin'),
    setLaunchAtLogin: (enabled) => invoke('settings:setLaunchAtLogin', enabled),
    getCloseToTray: () => invoke('settings:getCloseToTray'),
    setCloseToTray: (enabled) => invoke('settings:setCloseToTray', enabled),
    getLanguage: () => invoke('settings:getLanguage'),
    setLanguage: (language) => invoke('settings:setLanguage', language),
    onLanguageChanged: (cb) => {
      const listener = (_event: unknown, language: Parameters<typeof cb>[0]) => cb(language)
      ipcRenderer.on('language:changed', listener)
      return () => {
        ipcRenderer.removeListener('language:changed', listener)
      }
    },
  },
  dialog: {
    pickFolder: () => invoke('dialog:pickFolder'),
  },
  vault: {
    listNotes: () => invoke('vault:listNotes'),
    listDirs: () => invoke('vault:listDirs'),
    listDetailed: () => invoke('vault:listDetailed'),
    readNote: (path) => invoke('vault:readNote', path),
    writeNote: (req) => invoke('vault:writeNote', req),
    createNote: (path) => invoke('vault:createNote', path),
    deleteNote: (path) => invoke('vault:deleteNote', path),
    deleteFolder: (path) => invoke('vault:deleteFolder', path),
    listTrash: () => invoke('vault:listTrash'),
    restoreTrash: (id) => invoke('vault:restoreTrash', id),
    deleteTrashItem: (id) => invoke('vault:deleteTrashItem', id),
    emptyTrash: () => invoke('vault:emptyTrash'),
    createFolder: (path) => invoke('vault:createFolder', path),
    renameNote: (req) => invoke('vault:renameNote', req),
    renameFolder: (req) => invoke('vault:renameFolder', req),
    hasPassword: () => invoke('vault:hasPassword'),
    setPassword: (req) => invoke('vault:setPassword', req),
    unlock: (req) => invoke('vault:unlock', req),
    getPasswordHint: () => invoke('vault:getPasswordHint'),
    lockVault: () => invoke('vault:lockVault'),
    isVaultUnlocked: () => invoke('vault:isVaultUnlocked'),
    isLocked: (path) => invoke('vault:isLocked', path),
    lockNote: (path) => invoke('vault:lockNote', path),
    unlockNote: (path) => invoke('vault:unlockNote', path),
  },
  search: {
    query: (query) => invoke('search:query', query),
  },
  index: {
    rebuild: () => invoke('index:rebuild'),
  },
  tags: {
    list: () => invoke('tags:list'),
    notesForTag: (tag) => invoke('tags:notesForTag', tag),
  },
  attachment: {
    store: (req) => invoke('attachment:store', req),
    open: (relativePath) => invoke('attachment:open', relativePath),
  },
  capture: {
    save: (req) => invoke('capture:save', req),
    close: () => invoke('capture:close'),
  },
  window: {
    minimize: () => invoke('window:minimize'),
    toggleMaximize: () => invoke('window:toggleMaximize'),
    close: () => invoke('window:close'),
    forceClose: () => invoke('window:forceClose'),
    cancelQuit: () => invoke('window:cancelQuit'),
    isMaximized: () => invoke('window:isMaximized'),
    onMaximizeChange: (cb) => {
      const listener = (_event: unknown, isMaximized: boolean) => cb(isMaximized)
      ipcRenderer.on('window:maximized', listener)
      return () => {
        ipcRenderer.removeListener('window:maximized', listener)
      }
    },
    onFilesChanged: (cb) => {
      const listener = () => cb()
      ipcRenderer.on('vault:filesChanged', listener)
      return () => {
        ipcRenderer.removeListener('vault:filesChanged', listener)
      }
    },
    onNoteChanged: (cb) => {
      const listener = (_event: unknown, path: string) => cb(path)
      ipcRenderer.on('vault:noteChanged', listener)
      return () => {
        ipcRenderer.removeListener('vault:noteChanged', listener)
      }
    },
    onConfirmClose: (cb) => {
      const listener = () => cb()
      ipcRenderer.on('window:confirmClose', listener)
      return () => {
        ipcRenderer.removeListener('window:confirmClose', listener)
      }
    },
    onThemeChanged: (cb) => {
      const listener = (_event: unknown, theme: string) => cb(theme)
      ipcRenderer.on('theme:changed', listener)
      return () => {
        ipcRenderer.removeListener('theme:changed', listener)
      }
    },
    sticky: {
      open: (path) => invoke('window:sticky:open', path),
      close: (path) => invoke('window:sticky:close', path),
      onPathChanged: (cb) => {
        const listener = (_event: unknown, path: string) => cb(path)
        ipcRenderer.on('sticky:pathChanged', listener)
        return () => {
          ipcRenderer.removeListener('sticky:pathChanged', listener)
        }
      },
      onFlushRequest: (cb) => {
        const listener = (_event: unknown, id: number) => {
          void invoke('window:sticky:flushed', { id, draft: cb() })
        }
        ipcRenderer.on('sticky:flushRequest', listener)
        return () => {
          ipcRenderer.removeListener('sticky:flushRequest', listener)
        }
      },
    },
  },
  import: {
    pickSource: (req) => invoke('import:pickSource', req),
    scan: (sourcePath) => invoke('import:scan', sourcePath),
    execute: (req) => invoke('import:execute', req),
    onProgress: (cb) => {
      const listener = (_event: unknown, p: Parameters<typeof cb>[0]) => cb(p)
      ipcRenderer.on('import:progress', listener)
      return () => {
        ipcRenderer.removeListener('import:progress', listener)
      }
    },
  },
  update: {
    check: () => invoke('update:check'),
    install: () => invoke('update:install'),
    openReleases: (url) => invoke('update:openReleases', url),
    onState: (cb) => {
      const listener = (_event: unknown, state: Parameters<typeof cb>[0]) => cb(state)
      ipcRenderer.on('update:state', listener)
      return () => {
        ipcRenderer.removeListener('update:state', listener)
      }
    },
  },
  reminder: {
    list: () => invoke('reminder:list'),
    add: (req) => invoke('reminder:add', req),
    remove: (id) => invoke('reminder:remove', id),
    onFired: (cb) => {
      const listener = (_event: unknown, payload: Parameters<typeof cb>[0]) => cb(payload)
      ipcRenderer.on('reminder:fired', listener)
      // Deliver reminders that fired before this subscription existed (e.g.
      // overdue ones fired at launch while the renderer was still loading).
      void invoke('reminder:takePending').then((res) => {
        if (res.ok) for (const payload of res.data) cb(payload)
      })
      return () => {
        ipcRenderer.removeListener('reminder:fired', listener)
      }
    },
    onNavigate: (cb) => {
      const listener = (_event: unknown, payload: Parameters<typeof cb>[0]) => cb(payload)
      ipcRenderer.on('reminder:navigate', listener)
      return () => {
        ipcRenderer.removeListener('reminder:navigate', listener)
      }
    },
  },
  dailynotes: {
    list: (month) => invoke('dailynotes:list', month),
    open: (date) => invoke('dailynotes:open', date),
  },
  external: {
    read: (path) => invoke('external:read', path),
    write: (req) => invoke('external:write', req),
    openDropped: (files) => {
      // Paths come from the real dropped File objects (Electron 33 has no
      // File.path); a File built in page script has no path and is ignored.
      const paths = files
        .map((file) => {
          try {
            return webUtils.getPathForFile(file)
          } catch {
            return ''
          }
        })
        .filter((p) => p !== '')
      return invoke('external:resolveDropped', paths)
    },
    onOpenRequested: (cb) => {
      const drain = () => {
        void invoke('external:takePending').then((res) => {
          if (res.ok && res.data.length > 0) cb(res.data)
        })
      }
      const listener = () => drain()
      ipcRenderer.on('external:openRequested', listener)
      // Requests queued before this subscription (cold start / Open with).
      drain()
      return () => {
        ipcRenderer.removeListener('external:openRequested', listener)
      }
    },
  },
}

contextBridge.exposeInMainWorld('api', api)
