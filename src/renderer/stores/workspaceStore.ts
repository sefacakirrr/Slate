import { api } from '@renderer/api'
import { useTagsStore } from '@renderer/stores/tagsStore'
import { create } from 'zustand'

export type Tab = {
  /** Vault-relative path — the tab's identity. */
  path: string
  /** Last loaded-or-saved content (the dirty comparison baseline). */
  baseline: string
  /** Live editor buffer, mirrored from the tab's CodeMirror EditorState. */
  draft: string
  /** True when draft differs from baseline. */
  dirty: boolean
}

type WorkspaceState = {
  /** Open tabs, in open order. */
  tabs: Tab[]
  /** Path of the active tab, or null when no tabs are open. */
  activeTabPath: string | null
  /** Path of a dirty tab the user is trying to close; null when no prompt is pending. */
  pendingClose: string | null
  /**
   * Auto-save toggle (Epic 13). Starts false so nothing fires before the
   * persisted value loads; `loadAutoSave` sets the real value on startup.
   */
  autoSave: boolean

  /** Reads the persisted auto-save setting on startup. */
  loadAutoSave: () => Promise<void>
  /** Toggles auto-save and persists it; turning it off cancels pending saves. */
  setAutoSave: (enabled: boolean) => Promise<void>

  /** Opens a note in a tab (or focuses the existing tab) and activates it. */
  openTab: (path: string) => Promise<void>
  /** Activates an already-open tab. */
  activateTab: (path: string) => void
  /** Closes a tab; prompts (sets `pendingClose`) instead if it has unsaved changes. */
  closeTab: (path: string) => void
  /** Removes a tab outright (no dirty check) and activates a neighbor. */
  removeTab: (path: string) => void
  /** Records an edit from the editor for a tab; recomputes that tab's dirty. */
  setTabDraft: (path: string, draft: string) => void
  /** Persists a specific tab's draft to disk; clears its dirty on success. */
  saveTab: (path: string) => Promise<void>
  /** Persists the active tab. */
  saveActiveTab: () => Promise<void>
  /** Close-prompt → Save: save the pending tab, then close it (aborts if save fails). */
  confirmCloseSave: () => Promise<void>
  /** Close-prompt → Discard: close the pending tab without saving. */
  confirmCloseDiscard: () => void
  /** Close-prompt → Cancel: keep the tab. */
  cancelClose: () => void
  /** Re-opens the persisted workspace on launch (skips files that no longer exist). */
  restoreWorkspace: () => Promise<void>
  /** Clears all tabs and the persisted set (e.g. when the vault changes). */
  reset: () => void
  /** Re-points an open tab after a rename, keeping its draft/baseline/dirty. */
  renameTab: (oldPath: string, newPath: string) => void
  /**
   * Reloads an open tab's content from disk after an external change (Epic 11
   * Phase 03). Returns the new content to apply to the editor, or null when
   * nothing should change — the tab is dirty (keep the user's edits), not open,
   * or the disk content already matches (e.g. this window's own save).
   */
  reloadTab: (path: string) => Promise<string | null>
  /** Closes all tabs except the specified one (skips dirty tabs). */
  closeOtherTabs: (path: string) => void
  /** Closes tabs to the right of the specified one (skips dirty tabs). */
  closeTabsToRight: (path: string) => void
  /** Closes all tabs (skips dirty tabs). */
  closeAllTabs: () => void
  /** Closes all tabs whose paths are inside the given folder (no dirty check). */
  closeFolderTabs: (folderPath: string) => void
}

/** Fire-and-forget persistence of the open-tab set + active tab. */
function persistWorkspace(tabs: Tab[], activeTabPath: string | null): void {
  void api.settings.setWorkspace({ openTabs: tabs.map((t) => t.path), activeTab: activeTabPath })
}

/** Auto-save debounce interval (Epic 13). Not user-configurable in v1. */
export const AUTO_SAVE_DEBOUNCE_MS = 1000

/**
 * Pending auto-save timers, keyed by tab path. Module-level (not store state)
 * because timer handles are imperative bookkeeping, not renderable state — the
 * visible signal is the tab's `dirty` flag clearing when a save lands.
 */
const pendingSaves = new Map<string, ReturnType<typeof setTimeout>>()

function cancelPendingSave(path: string): void {
  const timer = pendingSaves.get(path)
  if (timer !== undefined) {
    clearTimeout(timer)
    pendingSaves.delete(path)
  }
}

function cancelAllPendingSaves(): void {
  for (const timer of pendingSaves.values()) clearTimeout(timer)
  pendingSaves.clear()
}

/** (Re)arms the debounce for one tab; the trailing edge persists via saveTab. */
function scheduleAutoSave(path: string): void {
  cancelPendingSave(path)
  const timer = setTimeout(() => {
    pendingSaves.delete(path)
    const s = useWorkspaceStore.getState()
    // Re-check at fire time: the toggle may have flipped or the tab closed
    // while the timer was pending.
    if (!s.autoSave || !s.tabs.some((t) => t.path === path)) return
    void s.saveTab(path)
  }, AUTO_SAVE_DEBOUNCE_MS)
  pendingSaves.set(path, timer)
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  tabs: [],
  activeTabPath: null,
  pendingClose: null,
  autoSave: false,

  loadAutoSave: async () => {
    const result = await api.settings.getAutoSave()
    if (result.ok) set({ autoSave: result.data })
  },

  setAutoSave: async (enabled) => {
    set({ autoSave: enabled })
    if (!enabled) cancelAllPendingSaves()
    await api.settings.setAutoSave(enabled)
  },

  openTab: async (path) => {
    if (get().tabs.some((t) => t.path === path)) {
      set({ activeTabPath: path })
      persistWorkspace(get().tabs, get().activeTabPath)
      return
    }
    const result = await api.vault.readNote(path)
    if (!result.ok) {
      console.error(`openTab: readNote failed for ${path}: ${result.error}`)
      return
    }
    const content = result.data
    set((s) => ({
      tabs: [...s.tabs, { path, baseline: content, draft: content, dirty: false }],
      activeTabPath: path,
    }))
    persistWorkspace(get().tabs, get().activeTabPath)
  },

  activateTab: (path) => {
    if (get().tabs.some((t) => t.path === path)) {
      set({ activeTabPath: path })
      persistWorkspace(get().tabs, get().activeTabPath)
    }
  },

  closeTab: (path) => {
    const tab = get().tabs.find((t) => t.path === path)
    if (tab === undefined) return
    if (tab.dirty) {
      // Don't close yet — the close prompt (App) drives the outcome.
      set({ pendingClose: path })
      return
    }
    get().removeTab(path)
  },

  removeTab: (path) => {
    cancelPendingSave(path)
    const { tabs, activeTabPath, pendingClose } = get()
    const idx = tabs.findIndex((t) => t.path === path)
    if (idx === -1) return
    const next = tabs.filter((t) => t.path !== path)
    let active = activeTabPath
    if (activeTabPath === path) {
      // Activate the left neighbor, else the new first, else nothing.
      active = next.length === 0 ? null : (next[idx - 1]?.path ?? next[0].path)
    }
    set({
      tabs: next,
      activeTabPath: active,
      pendingClose: pendingClose === path ? null : pendingClose,
    })
    persistWorkspace(next, active)
  },

  closeOtherTabs: (path) => {
    const { tabs, activeTabPath } = get()
    const keep = tabs.filter((t) => t.path === path || t.dirty)
    const active = keep.find((t) => t.path === activeTabPath) ? activeTabPath : path
    set({ tabs: keep, activeTabPath: active })
    persistWorkspace(keep, active)
  },

  closeTabsToRight: (path) => {
    const { tabs, activeTabPath } = get()
    const idx = tabs.findIndex((t) => t.path === path)
    if (idx === -1) return
    const keep = tabs.filter((t, i) => i <= idx || t.dirty)
    const active = keep.find((t) => t.path === activeTabPath) ? activeTabPath : path
    set({ tabs: keep, activeTabPath: active })
    persistWorkspace(keep, active)
  },

  closeAllTabs: () => {
    const { tabs } = get()
    const keep = tabs.filter((t) => t.dirty)
    const active = keep.length > 0 ? keep[0].path : null
    set({ tabs: keep, activeTabPath: active })
    persistWorkspace(keep, active)
  },

  setTabDraft: (path, draft) => {
    set((s) => ({
      tabs: s.tabs.map((t) => (t.path === path ? { ...t, draft, dirty: draft !== t.baseline } : t)),
    }))
    const tab = get().tabs.find((t) => t.path === path)
    if (tab === undefined) return
    if (get().autoSave && tab.dirty) scheduleAutoSave(path)
    // Draft returned to baseline — nothing left to persist.
    else cancelPendingSave(path)
  },

  saveTab: async (path) => {
    // A manual save (Ctrl+S) or a firing timer supersedes any pending debounce.
    cancelPendingSave(path)
    const tab = get().tabs.find((t) => t.path === path)
    if (tab === undefined || !tab.dirty) return

    const saved = tab.draft
    const result = await api.vault.writeNote({ path: tab.path, content: saved })
    if (!result.ok) {
      console.error(`saveTab: writeNote failed for ${tab.path}: ${result.error}`)
      return
    }
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.path === tab.path ? { ...t, baseline: saved, dirty: t.draft !== saved } : t,
      ),
    }))
    void useTagsStore.getState().loadTags()
  },

  saveActiveTab: async () => {
    const { activeTabPath } = get()
    if (activeTabPath !== null) await get().saveTab(activeTabPath)
  },

  confirmCloseSave: async () => {
    const path = get().pendingClose
    if (path === null) return
    await get().saveTab(path)
    // If the save failed the tab is still dirty — keep the prompt open, don't
    // close (avoids discarding the unsaved edits we tried to save).
    if (get().tabs.find((t) => t.path === path)?.dirty) return
    set({ pendingClose: null })
    get().removeTab(path)
  },

  confirmCloseDiscard: () => {
    const path = get().pendingClose
    if (path === null) return
    set({ pendingClose: null })
    get().removeTab(path)
  },

  cancelClose: () => set({ pendingClose: null }),

  restoreWorkspace: async () => {
    const result = await api.settings.getWorkspace()
    if (!result.ok) return
    const { openTabs, activeTab } = result.data
    // openTab reads each file and silently skips ones that no longer exist.
    for (const path of openTabs) {
      await get().openTab(path)
    }
    if (activeTab !== null && get().tabs.some((t) => t.path === activeTab)) {
      set({ activeTabPath: activeTab })
    }
    persistWorkspace(get().tabs, get().activeTabPath)
  },

  reset: () => {
    cancelAllPendingSaves()
    set({ tabs: [], activeTabPath: null, pendingClose: null })
    persistWorkspace([], null)
  },

  renameTab: (oldPath, newPath) => {
    if (oldPath === newPath) return
    // Re-key any pending auto-save so it fires against the new path.
    const hadPending = pendingSaves.has(oldPath)
    cancelPendingSave(oldPath)
    set((s) => ({
      tabs: s.tabs.map((t) => (t.path === oldPath ? { ...t, path: newPath } : t)),
      activeTabPath: s.activeTabPath === oldPath ? newPath : s.activeTabPath,
    }))
    if (hadPending) scheduleAutoSave(newPath)
    persistWorkspace(get().tabs, get().activeTabPath)
  },

  reloadTab: async (path) => {
    const tab = get().tabs.find((t) => t.path === path)
    if (tab === undefined) return null
    // Dirty with no auto-save pending (toggle off, or a save already in flight)
    // → never clobber the user's unsaved edits.
    if (tab.dirty && !pendingSaves.has(path)) return null
    const result = await api.vault.readNote(path)
    if (!result.ok) return null
    // No-op when disk already matches the baseline — e.g. the echo of this
    // window's own save. Keep any pending timer: the draft may still be ahead.
    if (result.data === tab.baseline) return null
    // Genuine external change while a debounced write was pending: cancel the
    // write and adopt disk content (Epic 13 — external change wins, no merge).
    cancelPendingSave(path)
    const content = result.data
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.path === path ? { ...t, baseline: content, draft: content, dirty: false } : t,
      ),
    }))
    return content
  },

  closeFolderTabs: (folderPath) => {
    const prefix = folderPath + '/'
    const { tabs, activeTabPath } = get()
    const next = tabs.filter((t) => t.path !== folderPath && !t.path.startsWith(prefix))
    for (const t of tabs) {
      if (!next.includes(t)) cancelPendingSave(t.path)
    }
    const active = next.some((t) => t.path === activeTabPath)
      ? activeTabPath
      : (next[next.length - 1]?.path ?? null)
    set({ tabs: next, activeTabPath: active })
    persistWorkspace(next, active)
  },
}))
