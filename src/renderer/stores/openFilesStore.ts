import { api } from '@renderer/api'
import { type TKey, t } from '@renderer/i18n'
import { baseName, isOpenableFileName } from '@renderer/stores/externalPath'
import { useWorkspaceStore } from '@renderer/stores/workspaceStore'
import type { OpenFileRequest } from '@shared/types'
import { create } from 'zustand'

/** User-facing reasons for a rejected open, keyed by main's error codes. */
const ERROR_KEYS: Record<string, TKey> = {
  'not-found': 'errors.openFiles.notFound',
  'not-a-file': 'errors.openFiles.notAFile',
  'too-large': 'errors.openFiles.tooLarge',
  'binary-file': 'errors.openFiles.binaryFile',
  'unsupported-encoding': 'errors.openFiles.unsupportedEncoding',
  'unsupported-type': 'errors.openFiles.unsupportedType',
  'not-allowed': 'errors.openFiles.notAllowed',
}

function describeError(error: string): string {
  return Object.hasOwn(ERROR_KEYS, error) ? t(ERROR_KEYS[error]) : error
}

type OpenFilesState = {
  /** The latest open failure(s), driving the error toast. Null when no toast. */
  failure: string | null
  dismiss: () => void
  /** Opens resolved requests as tabs (last one ends active); reports failures. */
  openRequests: (requests: OpenFileRequest[]) => Promise<void>
  /**
   * Opens the `.md`/`.markdown`/`.txt` files among dropped files. Returns how
   * many openable files there were (others are left to the caller).
   */
  openDroppedFiles: (files: File[]) => Promise<number>
}

export const useOpenFilesStore = create<OpenFilesState>((set) => ({
  failure: null,
  dismiss: () => set({ failure: null }),

  openRequests: async (requests) => {
    const failures: string[] = []
    for (const req of requests) {
      if (req.kind === 'error') {
        failures.push(
          t('errors.openFiles.item', {
            name: baseName(req.path),
            reason: describeError(req.error),
          }),
        )
        continue
      }
      await useWorkspaceStore.getState().openTab(req.path)
      if (!useWorkspaceStore.getState().tabs.some((t) => t.path === req.path)) {
        failures.push(
          t('errors.openFiles.item', {
            name: baseName(req.path),
            reason: t('errors.openFiles.unreadable'),
          }),
        )
      }
    }
    if (failures.length > 0)
      set({ failure: t('errors.openFiles.failed', { list: failures.join('; ') }) })
  },

  openDroppedFiles: async (files) => {
    const openable = files.filter((f) => isOpenableFileName(f.name))
    if (openable.length === 0) return 0
    const result = await api.external.openDropped(openable)
    if (!result.ok) {
      set({ failure: t('errors.openFiles.droppedFailed', { error: result.error }) })
      return openable.length
    }
    await useOpenFilesStore.getState().openRequests(result.data)
    return openable.length
  },
}))
