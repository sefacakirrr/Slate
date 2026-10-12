import { create } from 'zustand'

/**
 * A single transient error notice (bottom toast) for actions that have no
 * inline place to show a failure: drag-moves, lock/unlock, bulk saves.
 */
type NoticeState = {
  message: string | null
  /** Shows `message`, replacing any current notice. */
  notify: (message: string) => void
  dismiss: () => void
}

export const useNoticeStore = create<NoticeState>((set) => ({
  message: null,
  notify: (message) => set({ message }),
  dismiss: () => set({ message: null }),
}))
