import { api } from '@renderer/api'
import { useVaultStore } from '@renderer/stores/vaultStore'
import { useWorkspaceStore } from '@renderer/stores/workspaceStore'
import { create } from 'zustand'

/** True for a locked note's path (encrypted at rest). */
export function isLockedPath(path: string): boolean {
  return path.endsWith('.enc')
}

type PromptMode =
  /** Enter the existing vault password to unlock the session. */
  | 'unlock'
  /** Set the vault password for the first time (shows the no-recovery warning). */
  | 'set'

type EncryptionState = {
  /** Whether a vault password has been set at all. */
  hasPassword: boolean
  /** Whether the vault is unlocked this session (a key is held in main). */
  unlocked: boolean
  /** The active password prompt, or null when none is showing. */
  prompt: { mode: PromptMode; onSuccess?: () => void } | null
  /** Error to show inside the prompt (e.g. wrong password). */
  promptError: string | null
  /** True while a password submit / KDF is in flight (scrypt blocks briefly). */
  busy: boolean

  /** Loads hasPassword + unlocked from main (call on launch). */
  init: () => Promise<void>
  /** Runs `cb` once the vault is unlocked, opening the unlock prompt if needed. */
  ensureUnlocked: (cb?: () => void) => Promise<void>
  /** Opens a locked note in a tab, prompting for the vault password first if needed. */
  openLocked: (path: string) => Promise<void>
  /** Locks a plaintext note. Routes through set-password (with warning) on first use. */
  lockNote: (path: string) => Promise<void>
  /** Permanently decrypts a locked note back to plaintext. */
  unlockNote: (path: string) => Promise<void>
  /** Opens the first-time set-password prompt (with the no-recovery warning). */
  beginSetPassword: () => void
  /** Opens the unlock prompt (no follow-up action). */
  beginUnlock: () => void
  /** Clears the session key immediately — locked notes re-prompt. */
  lockVaultNow: () => Promise<void>
  /** Submits the prompt's password (unlock or set). */
  submitPassword: (password: string) => Promise<void>
  /** Dismisses the prompt without acting. */
  cancelPrompt: () => void
}

export const useEncryptionStore = create<EncryptionState>((set, get) => ({
  hasPassword: false,
  unlocked: false,
  prompt: null,
  promptError: null,
  busy: false,

  init: async () => {
    const [hp, un] = await Promise.all([api.vault.hasPassword(), api.vault.isVaultUnlocked()])
    set({
      hasPassword: hp.ok ? hp.data : false,
      unlocked: un.ok ? un.data : false,
    })
  },

  ensureUnlocked: async (cb) => {
    if (get().unlocked) {
      cb?.()
      return
    }
    set({ prompt: { mode: 'unlock', onSuccess: cb }, promptError: null })
  },

  openLocked: async (path) => {
    await get().ensureUnlocked(() => {
      void useWorkspaceStore.getState().openTab(path)
    })
  },

  lockNote: async (path) => {
    const doLock = async () => {
      // Flush any unsaved edits first: lockNote encrypts the on-disk content, so
      // an open dirty tab's draft would otherwise be silently dropped.
      await useWorkspaceStore.getState().saveTab(path)
      const result = await api.vault.lockNote(path)
      if (!result.ok) {
        console.error(`lockNote failed for ${path}: ${result.error}`)
        return
      }
      // The file's path changed (foo.md -> foo.md.enc): re-point any open tab and
      // refresh the list so the sidebar shows the locked entry.
      useWorkspaceStore.getState().renameTab(path, result.data.path)
      await useVaultStore.getState().loadFiles()
    }
    // First-ever lock: no password yet → set one (with the no-recovery warning).
    if (!get().hasPassword) {
      set({ prompt: { mode: 'set', onSuccess: () => void doLock() }, promptError: null })
      return
    }
    await get().ensureUnlocked(() => void doLock())
  },

  unlockNote: async (path) => {
    await get().ensureUnlocked(async () => {
      // Flush unsaved edits first (same reason as lockNote): unlockNote decrypts
      // the on-disk container, so an open dirty tab's draft would be lost.
      await useWorkspaceStore.getState().saveTab(path)
      const result = await api.vault.unlockNote(path)
      if (!result.ok) {
        console.error(`unlockNote failed for ${path}: ${result.error}`)
        return
      }
      useWorkspaceStore.getState().renameTab(path, result.data.path)
      await useVaultStore.getState().loadFiles()
    })
  },

  beginSetPassword: () => set({ prompt: { mode: 'set' }, promptError: null }),

  beginUnlock: () => set({ prompt: { mode: 'unlock' }, promptError: null }),

  lockVaultNow: async () => {
    await api.vault.lockVault()
    set({ unlocked: false })
  },

  submitPassword: async (password) => {
    const prompt = get().prompt
    if (prompt === null || password.length === 0) return
    set({ busy: true, promptError: null })

    if (prompt.mode === 'set') {
      const result = await api.vault.setPassword({ password })
      set({ busy: false })
      if (!result.ok) {
        set({ promptError: result.error })
        return
      }
      set({ hasPassword: true, unlocked: true, prompt: null, promptError: null })
      prompt.onSuccess?.()
      return
    }

    // mode === 'unlock'
    const result = await api.vault.unlock({ password })
    set({ busy: false })
    if (!result.ok) {
      set({ promptError: result.error })
      return
    }
    if (result.data !== true) {
      set({ promptError: 'Wrong password. Try again.' })
      return
    }
    set({ unlocked: true, prompt: null, promptError: null })
    prompt.onSuccess?.()
  },

  cancelPrompt: () => set({ prompt: null, promptError: null, busy: false }),
}))
