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
    onConfirmClose: (cb) => {
      const listener = () => cb()
      ipcRenderer.on('window:confirmClose', listener)
      return () => {
        ipcRenderer.removeListener('window:confirmClose', listener)
      }
    },
  },
}

contextBridge.exposeInMainWorld('api', api)
