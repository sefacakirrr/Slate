import { api } from '@renderer/api'
import { t } from '@renderer/i18n'
import type { TrashItem } from '@shared/types'
import { create } from 'zustand'

const OS_TRASH_KEY = api.platform === 'win32' ? 'win' : api.platform === 'darwin' ? 'mac' : 'linux'

/**
 * User-facing name of the OS recycle bin deleted originals go to, in the active
 * language: 'name' (bare), 'to' ("to the Recycle Bin"), 'in' ("in the Recycle Bin").
 */
export function osTrash(form: 'name' | 'to' | 'in'): string {
  return t(`common.osTrash.${OS_TRASH_KEY}.${form}`)
}

type TrashState = {
  /** Trash items, newest first. */
  items: TrashItem[]
  loading: boolean
  /** Whether the sidebar shows the Trash view instead of the note tree. */
  trashOpen: boolean
  /** The most recent delete, driving the undo toast. Null when no toast. */
  lastTrashed: TrashItem | null
  /** A delete that failed (nothing was deleted), driving an error toast. */
  deleteFailure: { name: string; error: string } | null

  toggleTrash: () => void
  closeTrash: () => void
  loadTrash: () => Promise<void>
  /** Records a fresh delete: shows the undo toast and refreshes the list if open. */
  notifyTrashed: (item: TrashItem) => void
  dismissToast: () => void
  /** Records a failed delete so the toast can tell the user nothing was deleted. */
  notifyDeleteFailed: (path: string, error: string) => void
  /** Restores an item. Returns the restored path, or null on failure. */
  restore: (id: string) => Promise<string | null>
  deletePermanently: (id: string) => Promise<void>
  emptyTrash: () => Promise<void>
}

export const useTrashStore = create<TrashState>((set, get) => ({
  items: [],
  loading: false,
  trashOpen: false,
  lastTrashed: null,
  deleteFailure: null,

  toggleTrash: () => {
    const open = !get().trashOpen
    set({ trashOpen: open })
    if (open) void get().loadTrash()
  },
  closeTrash: () => set({ trashOpen: false }),

  loadTrash: async () => {
    set({ loading: true })
    const result = await api.vault.listTrash()
    set({ items: result.ok ? result.data : [], loading: false })
  },

  notifyTrashed: (item) => {
    set({ lastTrashed: item, deleteFailure: null })
    if (get().trashOpen) void get().loadTrash()
  },
  dismissToast: () => set({ lastTrashed: null, deleteFailure: null }),
  notifyDeleteFailed: (path, error) =>
    set({ lastTrashed: null, deleteFailure: { name: path.split('/').pop() ?? path, error } }),

  restore: async (id) => {
    const result = await api.vault.restoreTrash(id)
    if (get().lastTrashed?.id === id) set({ lastTrashed: null })
    set((s) => ({ items: s.items.filter((i) => i.id !== id) }))
    if (!result.ok) {
      console.error(`restoreTrash failed: ${result.error}`)
      void get().loadTrash()
      return null
    }
    return result.data.path
  },

  deletePermanently: async (id) => {
    set((s) => ({ items: s.items.filter((i) => i.id !== id) }))
    if (get().lastTrashed?.id === id) set({ lastTrashed: null })
    const result = await api.vault.deleteTrashItem(id)
    if (!result.ok) {
      console.error(`deleteTrashItem failed: ${result.error}`)
      void get().loadTrash()
    }
  },

  emptyTrash: async () => {
    set({ items: [], lastTrashed: null })
    const result = await api.vault.emptyTrash()
    if (!result.ok) {
      console.error(`emptyTrash failed: ${result.error}`)
      void get().loadTrash()
    }
  },
}))
