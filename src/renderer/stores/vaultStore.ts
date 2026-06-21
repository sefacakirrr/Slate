import { api } from '@renderer/api'
import { useWorkspaceStore } from '@renderer/stores/workspaceStore'
import { create } from 'zustand'

type VaultState = {
  /** Absolute path to the active vault folder, or null when none is chosen. */
  vaultPath: string | null
  /** True while an async vault operation (load/pick) is in flight. */
  loading: boolean

  /** Flat list of vault-relative note paths (forward slashes). */
  fileList: string[]
  /** Flat list of vault-relative folder paths (no trailing slash). */
  folderList: string[]
  /** True while the file list is being (re)loaded. */
  treeLoading: boolean

  /** Reads the persisted vault path on startup. */
  loadVaultPath: () => Promise<void>
  /** Opens the native folder picker; persists and adopts the choice if made. */
  pickAndSetVault: () => Promise<void>
  /** (Re)loads the note list for the active vault. */
  loadFiles: () => Promise<void>
  /**
   * Creates a new empty note (optimistic). Returns its relative path on
   * success, or null on failure (list reverted).
   */
  createNote: (name?: string) => Promise<string | null>
  /** Deletes a note (optimistic, reverts on failure). */
  deleteNote: (path: string) => Promise<void>
  /** Recursively deletes a folder and all notes inside it (optimistic). */
  deleteFolder: (folderPath: string) => Promise<void>
  /**
   * Renames a note. Returns null on success, or the error message on failure
   * (e.g. `file-exists`, `invalid-extension`) so the caller can surface it.
   * Tab bookkeeping for an open note is handled by the caller via the workspace.
   */
  renameNote: (from: string, to: string) => Promise<string | null>
  /** Creates a new folder in the vault and refreshes the file list. */
  createFolder: (path: string) => Promise<string | null>
  /** Moves/renames a folder within the vault (optimistic). Returns error string or null. */
  moveFolder: (from: string, to: string) => Promise<string | null>
}

/** Case-insensitive alphabetical sort, matching VaultService's listing order. */
function sortPaths(paths: string[]): string[] {
  return [...paths].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
}

export const useVaultStore = create<VaultState>((set, get) => ({
  vaultPath: null,
  loading: true,
  fileList: [],
  folderList: [],
  treeLoading: false,

  loadVaultPath: async () => {
    set({ loading: true })
    const result = await api.settings.getVaultPath()
    set({ vaultPath: result.ok ? result.data : null, loading: false })
  },

  pickAndSetVault: async () => {
    const picked = await api.dialog.pickFolder()
    if (!picked.ok || picked.data === null) return

    set({ loading: true })
    const saved = await api.settings.setVaultPath(picked.data)
    // New vault → the open tabs belong to the old vault; clear the workspace.
    useWorkspaceStore.getState().reset()
    set({
      vaultPath: saved.ok ? picked.data : null,
      loading: false,
      fileList: [],
    })
  },

  loadFiles: async () => {
    set({ treeLoading: true })
    const [notes, dirs] = await Promise.all([api.vault.listNotes(), api.vault.listDirs()])
    set({
      fileList: notes.ok ? notes.data : [],
      folderList: dirs.ok ? dirs.data : [],
      treeLoading: false,
    })
  },

  createNote: async (name) => {
    const path = name ?? `untitled-${Date.now()}.md`
    const previous = get().fileList

    // Optimistic: show the file immediately.
    set({ fileList: sortPaths([...previous, path]) })

    const result = await api.vault.createNote(path)
    if (!result.ok) {
      console.error(`createNote failed: ${result.error}`)
      set({ fileList: previous })
      return null
    }
    return path
  },

  deleteNote: async (path) => {
    const previous = get().fileList
    set({ fileList: previous.filter((p) => p !== path) })
    const result = await api.vault.deleteNote(path)
    if (!result.ok) {
      console.error(`deleteNote failed: ${result.error}`)
      set({ fileList: previous })
    }
  },

  deleteFolder: async (folderPath) => {
    const prevFiles = get().fileList
    const prevFolders = get().folderList
    const prefix = folderPath + '/'
    set({
      fileList: prevFiles.filter((p) => !p.startsWith(prefix)),
      folderList: prevFolders.filter((p) => p !== folderPath && !p.startsWith(prefix)),
    })
    const result = await api.vault.deleteFolder(folderPath)
    if (!result.ok) {
      console.error(`deleteFolder failed: ${result.error}`)
      set({ fileList: prevFiles, folderList: prevFolders })
    }
  },

  renameNote: async (from, to) => {
    if (from === to) return null
    const result = await api.vault.renameNote({ from, to })
    if (!result.ok) {
      console.error(`renameNote failed: ${result.error}`)
      return result.error
    }
    set((s) => ({ fileList: sortPaths(s.fileList.map((p) => (p === from ? to : p))) }))
    return null
  },

  createFolder: async (path) => {
    const prevFolders = get().folderList
    set({ folderList: [...prevFolders, path].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())) })
    const result = await api.vault.createFolder(path)
    if (!result.ok) {
      console.error(`createFolder failed: ${result.error}`)
      set({ folderList: prevFolders })
      return result.error
    }
    return null
  },

  moveFolder: async (from, to) => {
    if (from === to) return null
    const { fileList, folderList } = get()
    const fromPrefix = from + '/'
    const toPrefix = to + '/'
    const prevFiles = fileList
    const prevFolders = folderList
    set({
      fileList: sortPaths(fileList.map((p) => (p.startsWith(fromPrefix) ? toPrefix + p.slice(fromPrefix.length) : p))),
      folderList: sortPaths([
        ...folderList.filter((p) => p !== from && !p.startsWith(fromPrefix)),
        to,
        ...folderList.filter((p) => p.startsWith(fromPrefix)).map((p) => toPrefix + p.slice(fromPrefix.length)),
      ]),
    })
    const result = await api.vault.renameFolder({ from, to })
    if (!result.ok) {
      console.error(`moveFolder failed: ${result.error}`)
      set({ fileList: prevFiles, folderList: prevFolders })
      return result.error
    }
    return null
  },
}))
