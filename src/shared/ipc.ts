/**
 * IPC contract — single source of truth shared by main, preload, and renderer.
 *
 * Every IPC command is declared in `IpcCommands` as a `{ request, response }` pair.
 * Handlers in main return raw responses (or throw); the IPC wrapper in
 * `main/ipc/handlers.ts` converts them to `IpcResult<T>` before they cross the
 * boundary, so renderer code always destructures `result.ok` to narrow safely.
 */

import type {
  ImportProgressInfo,
  ImportResultInfo,
  ImportScanInfo,
  NoteListItem,
  SearchResult,
  TagInfo,
  ThemeMode,
  UpdateState,
} from './types'

/** Discriminated union returned from every IPC handler. */
export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: string }

/** Every IPC command, keyed by channel name, with request and response types. */
export type IpcCommands = {
  'settings:getVaultPath': { request: undefined; response: string | null }
  'settings:setVaultPath': { request: string; response: undefined }
  'settings:getWorkspace': {
    request: undefined
    response: { openTabs: string[]; activeTab: string | null }
  }
  'settings:setWorkspace': {
    request: { openTabs: string[]; activeTab: string | null }
    response: undefined
  }
  'settings:getTheme': { request: undefined; response: ThemeMode }
  'settings:setTheme': { request: ThemeMode; response: undefined }
  /** Auto-save toggle (Epic 13). */
  'settings:getAutoSave': { request: undefined; response: boolean }
  'settings:setAutoSave': { request: boolean; response: undefined }
  'dialog:pickFolder': { request: undefined; response: string | null }
  'vault:listNotes': { request: undefined; response: string[] }
  'vault:listDirs': { request: undefined; response: string[] }
  'vault:listDetailed': { request: undefined; response: NoteListItem[] }
  'vault:readNote': { request: string; response: string }
  'vault:writeNote': {
    request: { path: string; content: string }
    response: undefined
  }
  'vault:createNote': { request: string; response: undefined }
  'vault:deleteNote': { request: string; response: undefined }
  'vault:deleteFolder': { request: string; response: undefined }
  'vault:createFolder': { request: string; response: undefined }
  'vault:renameNote': { request: { from: string; to: string }; response: undefined }
  'vault:renameFolder': { request: { from: string; to: string }; response: undefined }
  /** Whether a vault password has been set (Epic 10). */
  'vault:hasPassword': { request: undefined; response: boolean }
  /** First-time vault password setup. Rejects if one already exists. */
  'vault:setPassword': { request: { password: string }; response: undefined }
  /** Unlock the vault for this session. Resolves true on success, false on a wrong password. */
  'vault:unlock': { request: { password: string }; response: boolean }
  /** Clear the session key — the vault re-locks immediately. */
  'vault:lockVault': { request: undefined; response: undefined }
  /** Whether the vault is currently unlocked (a session key is held). */
  'vault:isVaultUnlocked': { request: undefined; response: boolean }
  /** Whether a given path is a locked (encrypted) note. */
  'vault:isLocked': { request: string; response: boolean }
  /** Encrypt a plaintext note in place → `<path>.enc`. Requires an unlocked vault. Returns the new path. */
  'vault:lockNote': { request: string; response: { path: string } }
  /** Decrypt a locked note back to plaintext, removing `.enc`. Requires an unlocked vault. Returns the new path. */
  'vault:unlockNote': { request: string; response: { path: string } }
  /** Full-text search over the FTS index; ranked best-first, capped server-side. */
  'search:query': { request: string; response: SearchResult[] }
  /** Drops and rebuilds the whole index from disk (the manual escape hatch). */
  'index:rebuild': { request: undefined; response: undefined }
  /** All tags with their note count, ordered by count DESC. */
  'tags:list': { request: undefined; response: TagInfo[] }
  /** Note paths that contain the given tag. */
  'tags:notesForTag': { request: string; response: string[] }
  /** Store an attachment (base64-encoded) and return its vault-relative path. */
  'attachment:store': {
    request: { data: string; name: string }
    response: { relativePath: string }
  }
  /** Open an attachment with the system default application. */
  'attachment:open': {
    request: string
    response: undefined
  }
  /** Save a quick-capture note to the vault and close the capture window. */
  'capture:save': {
    request: { content: string }
    response: { path: string }
  }
  /** Close the quick-capture window without saving. */
  'capture:close': {
    request: undefined
    response: undefined
  }
  /** Open (or focus) a sticky-note window for a note path (Epic 11). */
  'window:sticky:open': { request: string; response: undefined }
  /** Close a sticky-note window by note path (unpins it). */
  'window:sticky:close': { request: string; response: undefined }
  'window:minimize': { request: undefined; response: undefined }
  /** Toggles maximize/restore; resolves to the resulting maximized state. */
  'window:toggleMaximize': { request: undefined; response: boolean }
  'window:close': { request: undefined; response: undefined }
  'window:forceClose': { request: undefined; response: undefined }
  'window:isMaximized': { request: undefined; response: boolean }
  /** Trigger an update check (Epic 12); outcomes arrive via the `update:state` event. */
  'update:check': { request: undefined; response: undefined }
  /** Windows: install the downloaded update and relaunch. */
  'update:install': { request: undefined; response: undefined }
  /** macOS: open the GitHub Releases page (optionally a specific URL). */
  'update:openReleases': { request: string | undefined; response: undefined }
  /** Pick an import source: a folder or a Notion export zip (Epic 15). */
  'import:pickSource': { request: { kind: 'folder' | 'zip' }; response: string | null }
  /** Read-only scan of an import source for the wizard's preview step. */
  'import:scan': { request: string; response: ImportScanInfo }
  /** Run the import; per-note progress arrives via the `import:progress` event. */
  'import:execute': {
    request: { sourcePath: string; destination: 'imported-subfolder' | 'root' }
    response: ImportResultInfo
  }
}

export type IpcChannel = keyof IpcCommands
export type IpcRequest<K extends IpcChannel> = IpcCommands[K]['request']
export type IpcResponse<K extends IpcChannel> = IpcCommands[K]['response']

/**
 * Shape exposed to the renderer through `contextBridge`. Mirrors `IpcCommands`
 * but grouped by domain and wrapped in `IpcResult<T>` for safe consumption.
 * The preload script's `api` object satisfies this type.
 */
export type Api = {
  platform: NodeJS.Platform
  settings: {
    getVaultPath: () => Promise<IpcResult<string | null>>
    setVaultPath: (path: string) => Promise<IpcResult<undefined>>
    getWorkspace: () => Promise<IpcResult<{ openTabs: string[]; activeTab: string | null }>>
    setWorkspace: (ws: {
      openTabs: string[]
      activeTab: string | null
    }) => Promise<IpcResult<undefined>>
    getTheme: () => Promise<IpcResult<ThemeMode>>
    setTheme: (theme: ThemeMode) => Promise<IpcResult<undefined>>
    getAutoSave: () => Promise<IpcResult<boolean>>
    setAutoSave: (autoSave: boolean) => Promise<IpcResult<undefined>>
  }
  dialog: {
    pickFolder: () => Promise<IpcResult<string | null>>
  }
  vault: {
    listNotes: () => Promise<IpcResult<string[]>>
    listDirs: () => Promise<IpcResult<string[]>>
    listDetailed: () => Promise<IpcResult<NoteListItem[]>>
    readNote: (path: string) => Promise<IpcResult<string>>
    writeNote: (req: { path: string; content: string }) => Promise<IpcResult<undefined>>
    createNote: (path: string) => Promise<IpcResult<undefined>>
    deleteNote: (path: string) => Promise<IpcResult<undefined>>
    deleteFolder: (path: string) => Promise<IpcResult<undefined>>
    createFolder: (path: string) => Promise<IpcResult<undefined>>
    renameNote: (req: { from: string; to: string }) => Promise<IpcResult<undefined>>
    renameFolder: (req: { from: string; to: string }) => Promise<IpcResult<undefined>>
    hasPassword: () => Promise<IpcResult<boolean>>
    setPassword: (req: { password: string }) => Promise<IpcResult<undefined>>
    unlock: (req: { password: string }) => Promise<IpcResult<boolean>>
    lockVault: () => Promise<IpcResult<undefined>>
    isVaultUnlocked: () => Promise<IpcResult<boolean>>
    isLocked: (path: string) => Promise<IpcResult<boolean>>
    lockNote: (path: string) => Promise<IpcResult<{ path: string }>>
    unlockNote: (path: string) => Promise<IpcResult<{ path: string }>>
  }
  search: {
    query: (query: string) => Promise<IpcResult<SearchResult[]>>
  }
  index: {
    rebuild: () => Promise<IpcResult<undefined>>
  }
  tags: {
    list: () => Promise<IpcResult<TagInfo[]>>
    notesForTag: (tag: string) => Promise<IpcResult<string[]>>
  }
  attachment: {
    store: (req: { data: string; name: string }) => Promise<IpcResult<{ relativePath: string }>>
    open: (relativePath: string) => Promise<IpcResult<undefined>>
  }
  capture: {
    save: (req: { content: string }) => Promise<IpcResult<{ path: string }>>
    close: () => Promise<IpcResult<undefined>>
  }
  /** Custom frameless-window controls (native title bar is disabled). */
  window: {
    minimize: () => Promise<IpcResult<undefined>>
    toggleMaximize: () => Promise<IpcResult<boolean>>
    close: () => Promise<IpcResult<undefined>>
    forceClose: () => Promise<IpcResult<undefined>>
    isMaximized: () => Promise<IpcResult<boolean>>
    /**
     * Subscribes to maximize/restore changes (including OS-driven ones like
     * snap or double-click drag). Returns an unsubscribe function.
     */
    onMaximizeChange: (cb: (isMaximized: boolean) => void) => () => void
    onFilesChanged: (cb: () => void) => () => void
    /** One note's content changed on disk (Epic 11); payload is the note path. */
    onNoteChanged: (cb: (path: string) => void) => () => void
    onConfirmClose: (cb: () => void) => () => void
    /** Sticky-note windows (Epic 11). */
    sticky: {
      open: (path: string) => Promise<IpcResult<undefined>>
      close: (path: string) => Promise<IpcResult<undefined>>
    }
  }
  /** In-app updates (Epic 12). */
  update: {
    check: () => Promise<IpcResult<undefined>>
    install: () => Promise<IpcResult<undefined>>
    openReleases: (url?: string) => Promise<IpcResult<undefined>>
    /** Subscribe to update-state transitions. Returns an unsubscribe function. */
    onState: (cb: (state: UpdateState) => void) => () => void
  }
  /** Import wizard (Epic 15). */
  import: {
    pickSource: (req: { kind: 'folder' | 'zip' }) => Promise<IpcResult<string | null>>
    scan: (sourcePath: string) => Promise<IpcResult<ImportScanInfo>>
    execute: (req: {
      sourcePath: string
      destination: 'imported-subfolder' | 'root'
    }) => Promise<IpcResult<ImportResultInfo>>
    /** Subscribe to per-note import progress. Returns an unsubscribe function. */
    onProgress: (cb: (p: ImportProgressInfo) => void) => () => void
  }
}
