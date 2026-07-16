import type { Api, IpcChannel, IpcRequest, IpcResponse, IpcResult } from '@shared/ipc'
import { contextBridge, ipcRenderer } from 'electron'

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
}

contextBridge.exposeInMainWorld('api', api)
