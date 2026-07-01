import { api } from '@renderer/api'
import { create } from 'zustand'

/** Debounce window for sticky autosave — typing persists shortly after you stop. */
const AUTOSAVE_MS = 800
let autosaveTimer: ReturnType<typeof setTimeout> | null = null
function clearAutosave(): void {
  if (autosaveTimer !== null) {
    clearTimeout(autosaveTimer)
    autosaveTimer = null
  }
}

/**
 * State for a single sticky-note window (Epic 11). Each sticky is its own
 * renderer process, so this is a dedicated single-note store — deliberately NOT
 * `workspaceStore`, whose `persistWorkspace` writes the open-tab set to the
 * shared settings.json and would clobber the main window's tabs.
 *
 * The vault file is the source of truth; edits save through the normal
 * `vault:writeNote` path (last-write-wins, no cross-window live reload in v1).
 */
type StickyState = {
  path: string | null
  /** Last loaded-or-saved content (the dirty comparison baseline). */
  baseline: string
  /** Live editor buffer. */
  draft: string
  dirty: boolean
  status: 'loading' | 'ready' | 'error'
  error: string | null

  /** Loads the note's content into the store. */
  init: (path: string) => Promise<void>
  setDraft: (text: string) => void
  /** Persists the draft to the vault file; no-op if not dirty. */
  save: () => Promise<void>
  /**
   * Whether this note still exists as a plaintext note. False if it was deleted,
   * renamed, or locked (locked → it's now `.md.enc`, so the plaintext path is gone).
   * Used to close the sticky when the note becomes invalid elsewhere.
   */
  stillValid: () => Promise<boolean>
  /**
   * Re-reads the note from disk after an external change (Epic 11 Phase 03).
   * Returns the new content to apply to the editor, or null when nothing should
   * change — the sticky is dirty (keep the user's edits) or the disk content
   * already matches the current draft (e.g. this window's own save).
   */
  reloadFromDisk: () => Promise<string | null>
}

export const useStickyStore = create<StickyState>((set, get) => ({
  path: null,
  baseline: '',
  draft: '',
  dirty: false,
  status: 'loading',
  error: null,

  init: async (path) => {
    set({ path, status: 'loading', error: null })
    const result = await api.vault.readNote(path)
    if (!result.ok) {
      set({ status: 'error', error: result.error })
      return
    }
    set({ baseline: result.data, draft: result.data, dirty: false, status: 'ready' })
  },

  setDraft: (text) => {
    set((s) => ({ draft: text, dirty: text !== s.baseline }))
    // Debounced autosave: typing persists ~0.8s after you stop, so edits
    // propagate to other windows without a manual save.
    clearAutosave()
    autosaveTimer = setTimeout(() => {
      autosaveTimer = null
      void get().save()
    }, AUTOSAVE_MS)
  },

  save: async () => {
    clearAutosave()
    const { path, draft, dirty } = get()
    if (path === null || !dirty) return
    const result = await api.vault.writeNote({ path, content: draft })
    if (!result.ok) {
      console.error(`sticky save failed for ${path}: ${result.error}`)
      return
    }
    set((s) => ({ baseline: draft, dirty: s.draft !== draft }))
  },

  stillValid: async () => {
    const { path } = get()
    if (path === null) return true
    const result = await api.vault.listNotes()
    // On a transient error, don't close the sticky — assume still valid.
    if (!result.ok) return true
    // A locked note becomes `<path>.enc`, so the plaintext path drops out of the
    // list; deletes and renames drop it too.
    return result.data.includes(path)
  },

  reloadFromDisk: async () => {
    const { path, dirty, draft } = get()
    // Never clobber unsaved edits.
    if (path === null || dirty) return null
    const result = await api.vault.readNote(path)
    if (!result.ok) return null
    // No-op when disk already matches the buffer (e.g. this window's own save).
    if (result.data === draft) return null
    set({ baseline: result.data, draft: result.data, dirty: false })
    return result.data
  },
}))
