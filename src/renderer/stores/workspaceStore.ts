import { api } from '@renderer/api'
import { t } from '@renderer/i18n'
import { useDiskSyncStore } from '@renderer/stores/diskSyncStore'
import { isExternalTabPath } from '@renderer/stores/externalPath'
import { useNoticeStore } from '@renderer/stores/noticeStore'
import { useTagsStore } from '@renderer/stores/tagsStore'
import { describeVaultError } from '@renderer/stores/vaultErrors'
import { create } from 'zustand'

export type Tab = {
  /**
   * The tab's identity: a vault-relative path, or an absolute path for an
   * external (outside-vault) file — see `isExternalTabPath`.
   */
  path: string
  /** Last loaded-or-saved content (the dirty comparison baseline). */
  baseline: string
  /** Live editor buffer, mirrored from the tab's CodeMirror EditorState. */
  draft: string
  /** True when draft differs from baseline. */
  dirty: boolean
  /**
   * Locked-note placeholder: a `.enc` tab whose content isn't loaded because
   * the vault is locked (restored after a restart, or after "Lock vault now").
   * baseline/draft stay empty — no plaintext is held until it's unlocked.
   */
  locked?: true
}

type WorkspaceState = {
  /** Open tabs, in open order. */
  tabs: Tab[]
  /** Path of the active tab, or null when no tabs are open. */
  activeTabPath: string | null
  /** Path of a dirty tab the user is trying to close; null when no prompt is pending. */
  pendingClose: string | null
  /**
   * Further dirty tabs a bulk close (Close Others/Left/Right/All) still has to
   * ask about, after `pendingClose`. Cancel at the prompt drops the rest.
   */
  closeQueue: string[]
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
  /**
   * Persists a specific tab's draft to disk; clears its dirty on success.
   * Unless `force`, first checks the file wasn't changed on disk by another
   * program (diskSyncStore) and raises a conflict prompt instead of writing.
   * `auto` marks an auto-save (a dismissed conflict doesn't re-prompt).
   */
  saveTab: (path: string, opts?: { force?: boolean; auto?: boolean }) => Promise<void>
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
  /** Closes all tabs except the specified one (dirty ones prompt one by one). */
  closeOtherTabs: (path: string) => void
  /** Closes tabs to the left of the specified one (dirty ones prompt one by one). */
  closeTabsToLeft: (path: string) => void
  /** Closes tabs to the right of the specified one (dirty ones prompt one by one). */
  closeTabsToRight: (path: string) => void
  /** Closes all tabs (dirty ones prompt one by one). */
  closeAllTabs: () => void
  /** Closes all tabs whose paths are inside the given folder (no dirty check). */
  closeFolderTabs: (folderPath: string) => void
  /** Re-points every open tab inside a moved/renamed folder, keeping drafts. */
  renameFolderTabs: (from: string, to: string) => void
  /**
   * Turns open tabs into locked placeholders (vault just locked): drops their
   * text from memory and cancels pending saves. Save them first.
   */
  lockTabs: (paths: string[]) => void
  /**
   * Saves every dirty tab at `path` or inside the folder `path`. Resolves true
   * when none is left dirty (all saved, or nothing to save).
   */
  saveTabsUnder: (path: string) => Promise<boolean>
  /** Reorders a tab from one index to another (drag-drop). */
  reorderTab: (fromIdx: number, toIdx: number) => void
}

/** Reads a tab's file: vault note, or allowlisted external file by absolute path. */
function readTabFile(path: string) {
  return isExternalTabPath(path) ? api.external.read(path) : api.vault.readNote(path)
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
    void s.saveTab(path, { auto: true })
  }, AUTO_SAVE_DEBOUNCE_MS)
  pendingSaves.set(path, timer)
}

/**
 * In-flight file moves (rename / drag-move of a note or folder, lock/unlock).
 * Between the file moving on disk and `renameTab` re-pointing its tab, a save
 * (Ctrl+S, auto-save timer) would write the draft to the old path and recreate
 * the moved-away file. Saves wait for this barrier, and moves wait for saves
 * already in flight, so the two never interleave. See {@link runTabMove}.
 */
let moveBarrier: Promise<unknown> = Promise.resolve()
const inFlightSaves = new Set<Promise<unknown>>()
/** old path → new path for tabs re-pointed by renameTab (lets a waiting save follow its tab). */
const movedTo = new Map<string, string>()

/**
 * Runs a file move whose tab bookkeeping (`renameTab` / `renameFolderTabs`)
 * happens inside `op`. Moves run one at a time, after in-flight saves; saves
 * requested meanwhile run after it, against the tab's new path.
 */
export function runTabMove<T>(op: () => Promise<T>): Promise<T> {
  const run = moveBarrier.then(async () => {
    await Promise.allSettled([...inFlightSaves])
    return op()
  })
  moveBarrier = run.catch(() => undefined)
  return run
}

/** Follows renameTab's forwarding pointers from `path` to the tab's current path. */
function resolveMovedPath(path: string): string {
  let p = path
  for (let i = 0; i < 32 && movedTo.has(p); i++) p = movedTo.get(p) as string
  return p
}

/** A locked (encrypted) note's tab path — same rule as encryptionStore.isLockedPath. */
function isLockedTabPath(path: string): boolean {
  return !isExternalTabPath(path) && path.endsWith('.enc')
}

/** True when `path` is `target` itself or lies inside the folder `target`. */
export function isUnder(path: string, target: string): boolean {
  return path === target || path.startsWith(`${target}/`)
}

/**
 * Bulk close: clean tabs close at once; dirty ones go through the close prompt
 * one at a time (Save / Discard / Cancel — Cancel keeps the rest).
 */
function closeMany(paths: string[]): void {
  const s = useWorkspaceStore.getState()
  const dirty: string[] = []
  for (const p of paths) {
    const tab = useWorkspaceStore.getState().tabs.find((t) => t.path === p)
    if (tab === undefined) continue
    if (tab.dirty) dirty.push(p)
    else s.removeTab(p)
  }
  if (dirty.length > 0) {
    useWorkspaceStore.setState({ pendingClose: dirty[0], closeQueue: dirty.slice(1) })
  }
}

/** After a close prompt resolves, asks about the next queued dirty tab (if any). */
function advanceCloseQueue(): void {
  let queue = useWorkspaceStore.getState().closeQueue
  while (queue.length > 0) {
    const [next, ...rest] = queue
    queue = rest
    const tab = useWorkspaceStore.getState().tabs.find((t) => t.path === next)
    if (tab === undefined) continue
    if (!tab.dirty) {
      useWorkspaceStore.getState().removeTab(next)
      continue
    }
    useWorkspaceStore.setState({ pendingClose: next, closeQueue: rest })
    return
  }
  useWorkspaceStore.setState({ closeQueue: [] })
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  tabs: [],
  activeTabPath: null,
  pendingClose: null,
  closeQueue: [],
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
    const existing = get().tabs.find((t) => t.path === path)
    if (existing?.locked) {
      // Locked placeholder: load the note now (works once the vault is unlocked).
      set({ activeTabPath: path })
      const read = await readTabFile(path)
      if (read.ok) {
        const content = read.data
        set((s) => ({
          tabs: s.tabs.map((t) =>
            t.path === path && t.locked
              ? { path, baseline: content, draft: content, dirty: false }
              : t,
          ),
        }))
      }
      persistWorkspace(get().tabs, get().activeTabPath)
      return
    }
    if (existing !== undefined) {
      set({ activeTabPath: path })
      persistWorkspace(get().tabs, get().activeTabPath)
      return
    }
    const result = await readTabFile(path)
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
      persistWorkspace(get().tabs, path)
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
    if (!get().tabs.some((t) => t.path === path)) return
    get().activateTab(path)
    closeMany(
      get()
        .tabs.filter((t) => t.path !== path)
        .map((t) => t.path),
    )
  },

  closeTabsToLeft: (path) => {
    const { tabs, activeTabPath } = get()
    const idx = tabs.findIndex((t) => t.path === path)
    if (idx === -1) return
    const doomed = tabs.slice(0, idx).map((t) => t.path)
    if (activeTabPath !== null && doomed.includes(activeTabPath)) get().activateTab(path)
    closeMany(doomed)
  },

  closeTabsToRight: (path) => {
    const { tabs, activeTabPath } = get()
    const idx = tabs.findIndex((t) => t.path === path)
    if (idx === -1) return
    const doomed = tabs.slice(idx + 1).map((t) => t.path)
    if (activeTabPath !== null && doomed.includes(activeTabPath)) get().activateTab(path)
    closeMany(doomed)
  },

  closeAllTabs: () => {
    closeMany(get().tabs.map((t) => t.path))
  },

  setTabDraft: (path, draft) => {
    if (get().tabs.find((t) => t.path === path)?.locked) return
    set((s) => ({
      tabs: s.tabs.map((t) => (t.path === path ? { ...t, draft, dirty: draft !== t.baseline } : t)),
    }))
    const tab = get().tabs.find((t) => t.path === path)
    if (tab === undefined) return
    if (get().autoSave && tab.dirty) scheduleAutoSave(path)
    // Draft returned to baseline — nothing left to persist.
    else cancelPendingSave(path)
  },

  saveTab: async (requested, opts) => {
    // A manual save (Ctrl+S) or a firing timer supersedes any pending debounce.
    cancelPendingSave(requested)
    // Never write while the file is being moved: wait, then follow the tab.
    let barrier: Promise<unknown>
    do {
      barrier = moveBarrier
      await barrier
    } while (barrier !== moveBarrier)
    const path = get().tabs.some((t) => t.path === requested)
      ? requested
      : resolveMovedPath(requested)
    if (path !== requested) cancelPendingSave(path)
    const tab = get().tabs.find((t) => t.path === path)
    if (tab === undefined || !tab.dirty || tab.locked) return
    // Moves requested from here on wait until this save has landed.
    let release = () => {}
    const busy = new Promise<void>((r) => {
      release = r
    })
    inFlightSaves.add(busy)
    const result = await (async () => {
      // Changed on disk by another program since load/save → prompt, don't clobber.
      if (!opts?.force && !(await useDiskSyncStore.getState().checkBeforeSave(tab, !!opts?.auto))) {
        return null
      }
      return isExternalTabPath(tab.path)
        ? api.external.write({ path: tab.path, content: tab.draft })
        : api.vault.writeNote({ path: tab.path, content: tab.draft })
    })().finally(() => {
      inFlightSaves.delete(busy)
      release()
    })
    if (result === null) return
    const saved = tab.draft
    const external = isExternalTabPath(tab.path)
    if (!result.ok) {
      console.error(`saveTab: writeNote failed for ${tab.path}: ${result.error}`)
      // Never fail silently: the dirty dot alone doesn't say the save failed.
      useNoticeStore
        .getState()
        .notify(
          t('errors.save.failed', { path: tab.path, reason: describeVaultError(result.error) }),
        )
      return
    }
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.path === tab.path ? { ...t, baseline: saved, dirty: t.draft !== saved } : t,
      ),
    }))
    // External files aren't indexed, so their tags never change.
    if (!external) void useTagsStore.getState().loadTags()
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
    advanceCloseQueue()
  },

  confirmCloseDiscard: () => {
    const path = get().pendingClose
    if (path === null) return
    set({ pendingClose: null })
    get().removeTab(path)
    advanceCloseQueue()
  },

  cancelClose: () => set({ pendingClose: null, closeQueue: [] }),

  restoreWorkspace: async () => {
    const result = await api.settings.getWorkspace()
    if (!result.ok) return
    const { openTabs, activeTab } = result.data
    // openTab reads each file and silently skips ones that no longer exist.
    // Locked notes can't be read before the vault is unlocked: they come back
    // as placeholders (no content) if the file still exists.
    let existing: Set<string> | null = null
    for (const path of openTabs) {
      if (!isLockedTabPath(path)) {
        await get().openTab(path)
        continue
      }
      const read = await readTabFile(path)
      if (read.ok) {
        const content = read.data
        set((s) => ({
          tabs: [...s.tabs, { path, baseline: content, draft: content, dirty: false }],
          activeTabPath: path,
        }))
        continue
      }
      if (read.error !== 'note-locked') continue
      if (existing === null) {
        const list = await api.vault.listNotes()
        existing = new Set(list.ok ? list.data : [])
      }
      if (!existing.has(path) || get().tabs.some((t) => t.path === path)) continue
      set((s) => ({
        tabs: [...s.tabs, { path, baseline: '', draft: '', dirty: false, locked: true }],
        activeTabPath: path,
      }))
    }
    if (activeTab !== null && get().tabs.some((t) => t.path === activeTab)) {
      set({ activeTabPath: activeTab })
    }
    persistWorkspace(get().tabs, get().activeTabPath)
  },

  reset: () => {
    cancelAllPendingSaves()
    movedTo.clear()
    set({ tabs: [], activeTabPath: null, pendingClose: null, closeQueue: [] })
    persistWorkspace([], null)
  },

  renameTab: (oldPath, newPath) => {
    if (oldPath === newPath) return
    // Re-key any pending auto-save so it fires against the new path.
    const hadPending = pendingSaves.has(oldPath)
    cancelPendingSave(oldPath)
    movedTo.delete(newPath)
    movedTo.set(oldPath, newPath)
    set((s) => ({
      tabs: s.tabs.map((t) => (t.path === oldPath ? { ...t, path: newPath } : t)),
      activeTabPath: s.activeTabPath === oldPath ? newPath : s.activeTabPath,
    }))
    if (hadPending) scheduleAutoSave(newPath)
    persistWorkspace(get().tabs, get().activeTabPath)
  },

  reloadTab: async (path) => {
    const tab = get().tabs.find((t) => t.path === path)
    if (tab === undefined || tab.locked) return null
    // Dirty with no auto-save pending (toggle off, or a save already in flight)
    // → never clobber the user's unsaved edits.
    if (tab.dirty && !pendingSaves.has(path)) return null
    const result = await readTabFile(path)
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
    const prefix = `${folderPath}/`
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

  renameFolderTabs: (from, to) => {
    if (from === to) return
    for (const t of get().tabs) {
      if (t.path.startsWith(`${from}/`)) get().renameTab(t.path, to + t.path.slice(from.length))
    }
  },

  lockTabs: (paths) => {
    const doomed = new Set(paths)
    for (const p of doomed) cancelPendingSave(p)
    set((s) => ({
      tabs: s.tabs.map((t) =>
        doomed.has(t.path)
          ? { path: t.path, baseline: '', draft: '', dirty: false, locked: true as const }
          : t,
      ),
    }))
  },

  saveTabsUnder: async (path) => {
    const targets = get()
      .tabs.filter((t) => t.dirty && isUnder(t.path, path))
      .map((t) => t.path)
    for (const p of targets) await get().saveTab(p)
    return !get().tabs.some((t) => t.dirty && isUnder(t.path, path))
  },

  reorderTab: (fromIdx, toIdx) => {
    const { tabs, activeTabPath } = get()
    if (fromIdx < 0 || fromIdx >= tabs.length || toIdx < 0 || toIdx >= tabs.length) return
    const next = [...tabs]
    const [moved] = next.splice(fromIdx, 1)
    next.splice(toIdx, 0, moved)
    set({ tabs: next })
    persistWorkspace(next, activeTabPath)
  },
}))
