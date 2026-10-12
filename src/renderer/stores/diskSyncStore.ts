import { api } from '@renderer/api'
import { isExternalTabPath } from '@renderer/stores/externalPath'
import { type Tab, useWorkspaceStore } from '@renderer/stores/workspaceStore'
import { create } from 'zustand'

/**
 * Keeps open tabs honest about their file on disk when another program edits
 * it. Neither external files nor vault notes are watched, so the check is
 * content-based and on demand: the tab's `baseline` is what Slate last read or
 * wrote, and before a save (and when the window regains focus) the file is
 * re-read and compared to it.
 *
 * - Save, disk ≠ baseline → don't write; raise a conflict prompt (Overwrite /
 *   Reload / Cancel). An auto-save conflict prompts once: after Cancel, further
 *   auto-saves stay silent while the disk still holds the same version.
 * - Focus, clean tab, disk ≠ baseline → adopt the disk version silently.
 * - Focus, external file gone → mark the tab `missing`, keep its content;
 *   saving recreates the file.
 */

export type SaveConflict = { path: string; disk: string }

type DiskSyncState = {
  /** The save conflict awaiting the user's choice, or null. */
  conflict: SaveConflict | null
  /** External tabs whose file no longer exists on disk. */
  missing: string[]
  /**
   * Called by `saveTab` before writing. Resolves true when the write may go
   * ahead; false when the file changed on disk (a prompt is raised, or for an
   * auto-save already dismissed for this disk version, nothing happens).
   */
  checkBeforeSave: (tab: Tab, auto: boolean) => Promise<boolean>
  /** Conflict → Overwrite: write Slate's version over the disk version. */
  overwrite: () => Promise<void>
  /** Conflict → Reload: discard Slate's edits and load the disk version. */
  reload: () => Promise<void>
  /** Conflict → Cancel: keep the edits unsaved (tab stays dirty). */
  cancel: () => void
  /** Window regained focus: reload changed clean tabs, mark deleted external files. */
  checkOpenTabs: () => Promise<void>
}

/** Path → disk content the user chose to keep their edits over (Cancel). */
const dismissed = new Map<string, string>()

/** Editor bridge: EditorHost registers how to push new content into a tab's editor state. */
type ContentListener = (path: string, content: string) => void
const contentListeners = new Set<ContentListener>()

/** Subscribes the editor to disk-driven content replacements. Returns the unsubscribe. */
export function onDiskContent(listener: ContentListener): () => void {
  contentListeners.add(listener)
  return () => contentListeners.delete(listener)
}

function readDisk(path: string) {
  return isExternalTabPath(path) ? api.external.read(path) : api.vault.readNote(path)
}

/**
 * The text as the editor sees it: no BOM, LF line endings. Vault notes are read
 * raw (CRLF/BOM kept) while CodeMirror's doc is always LF, so disk and baseline
 * are compared in this form — otherwise a CRLF note looks "changed" forever.
 */
export function normalizeText(text: string): string {
  return text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
}

/**
 * Replaces a tab's baseline + draft with `content` (normalized, so the editor's
 * LF echo of it doesn't mark the tab dirty) and pushes it into its editor.
 */
function adopt(path: string, raw: string): void {
  const content = normalizeText(raw)
  useWorkspaceStore.setState((s) => ({
    tabs: s.tabs.map((t) =>
      t.path === path ? { ...t, baseline: content, draft: content, dirty: false } : t,
    ),
  }))
  for (const l of contentListeners) l(path, content)
}

function setMissing(path: string, gone: boolean): void {
  const { missing } = useDiskSyncStore.getState()
  const has = missing.includes(path)
  if (gone && !has) useDiskSyncStore.setState({ missing: [...missing, path] })
  else if (!gone && has) useDiskSyncStore.setState({ missing: missing.filter((p) => p !== path) })
}

export const useDiskSyncStore = create<DiskSyncState>((set, get) => ({
  conflict: null,
  missing: [],

  checkBeforeSave: async (tab, auto) => {
    // A prompt for this tab is already up — don't stack another or write past it.
    if (get().conflict?.path === tab.path) return false
    const disk = await readDisk(tab.path)
    if (!disk.ok) {
      // Gone (or unreadable): nothing on disk to protect — the write recreates
      // it, or fails exactly as it did before this check existed.
      if (disk.error === 'not-found') setMissing(tab.path, false)
      return true
    }
    setMissing(tab.path, false)
    const theirs = normalizeText(disk.data)
    if (theirs === normalizeText(tab.baseline) || theirs === normalizeText(tab.draft)) {
      dismissed.delete(tab.path)
      return true
    }
    if (auto && dismissed.get(tab.path) === theirs) return false
    set({ conflict: { path: tab.path, disk: theirs } })
    return false
  },

  overwrite: async () => {
    const c = get().conflict
    if (c === null) return
    set({ conflict: null })
    dismissed.delete(c.path)
    await useWorkspaceStore.getState().saveTab(c.path, { force: true })
  },

  reload: async () => {
    const c = get().conflict
    if (c === null) return
    set({ conflict: null })
    dismissed.delete(c.path)
    if (!useWorkspaceStore.getState().tabs.some((t) => t.path === c.path)) return
    // Re-read: the file may have moved on since the prompt opened.
    const fresh = await readDisk(c.path)
    adopt(c.path, fresh.ok ? fresh.data : c.disk)
  },

  cancel: () => {
    const c = get().conflict
    if (c === null) return
    dismissed.set(c.path, c.disk)
    set({ conflict: null })
  },

  checkOpenTabs: async () => {
    for (const tab of useWorkspaceStore.getState().tabs) {
      const external = isExternalTabPath(tab.path)
      const disk = await readDisk(tab.path)
      if (!disk.ok) {
        // Only external files are marked: a vault read can also fail because
        // a locked note's vault is locked, which isn't "deleted".
        if (external && disk.error === 'not-found') setMissing(tab.path, true)
        continue
      }
      if (external) setMissing(tab.path, false)
      // Re-check after the await: the user may have typed (or saved) meanwhile.
      const now = useWorkspaceStore.getState().tabs.find((t) => t.path === tab.path)
      if (now === undefined || now.dirty || now.baseline !== tab.baseline) continue
      if (normalizeText(disk.data) !== normalizeText(now.baseline)) adopt(tab.path, disk.data)
    }
  },
}))
