import { api } from '@renderer/api'
import { useEncryptionStore } from '@renderer/stores/encryptionStore'
import { useThemeStore } from '@renderer/stores/themeStore'
import { useVaultStore } from '@renderer/stores/vaultStore'
import { useWorkspaceStore } from '@renderer/stores/workspaceStore'
import type { ThemeMode, UpdateState } from '@shared/types'
import { useEffect, useState } from 'react'

const mod = api.platform === 'darwin' ? '⌘' : 'Ctrl'

const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'system', label: 'System' },
]

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const pickAndSetVault = useVaultStore((s) => s.pickAndSetVault)
  const theme = useThemeStore((s) => s.theme)
  const setTheme = useThemeStore((s) => s.setTheme)
  const hasPassword = useEncryptionStore((s) => s.hasPassword)
  const unlocked = useEncryptionStore((s) => s.unlocked)
  const beginSetPassword = useEncryptionStore((s) => s.beginSetPassword)
  const beginUnlock = useEncryptionStore((s) => s.beginUnlock)
  const lockVaultNow = useEncryptionStore((s) => s.lockVaultNow)
  const autoSave = useWorkspaceStore((s) => s.autoSave)
  const setAutoSave = useWorkspaceStore((s) => s.setAutoSave)
  const [rebuilding, setRebuilding] = useState(false)
  const [rebuildStatus, setRebuildStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [update, setUpdate] = useState<UpdateState | { status: 'idle' }>({ status: 'idle' })

  // Subscribe to update-state pushes from main (Epic 12).
  useEffect(() => api.update.onState(setUpdate), [])

  const busyUpdate = update.status === 'checking' || update.status === 'downloading'

  return (
    <div className="flex h-full flex-col bg-slate-950 dark:bg-slate-950 light:bg-white">
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3 dark:border-slate-800 light:border-slate-200">
        <h2 className="text-sm font-semibold text-slate-200 dark:text-slate-200 light:text-slate-800">
          Settings
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-300 dark:hover:bg-slate-800 light:hover:bg-slate-100 light:text-slate-500 light:hover:text-slate-700"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path
              d="M1 1l12 12M13 1L1 13"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Theme */}
        <section>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-slate-400 light:text-slate-500">
            Theme
          </h3>
          <div className="flex gap-1 rounded-lg bg-slate-900 p-1 dark:bg-slate-900 light:bg-slate-100">
            {THEME_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setTheme(opt.value)}
                className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  theme === opt.value
                    ? 'bg-accent-600 text-white'
                    : 'text-slate-400 hover:text-slate-200 dark:text-slate-400 dark:hover:text-slate-200 light:text-slate-600 light:hover:text-slate-800'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </section>

        {/* Vault */}
        <section>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-slate-400 light:text-slate-500">
            Vault
          </h3>
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate rounded bg-slate-900 px-3 py-2 text-xs text-slate-300 dark:bg-slate-900 dark:text-slate-300 light:bg-slate-100 light:text-slate-700">
              {vaultPath ?? 'No vault selected'}
            </span>
            <button
              type="button"
              onClick={pickAndSetVault}
              className="shrink-0 rounded-md bg-slate-800 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-700 dark:bg-slate-800 dark:text-slate-300 light:bg-slate-200 light:text-slate-700 light:hover:bg-slate-300"
            >
              Change
            </button>
          </div>
        </section>

        {/* Editing (Epic 13) */}
        <section>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-slate-400 light:text-slate-500">
            Editing
          </h3>
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <span className="text-xs text-slate-300 dark:text-slate-300 light:text-slate-700">
                Auto-save
              </span>
              <p className="text-xs text-slate-500 light:text-slate-400">
                Save the active note automatically after you stop typing. {mod}+S still saves
                immediately.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={autoSave}
              onClick={() => void setAutoSave(!autoSave)}
              className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                autoSave ? 'bg-accent-600' : 'bg-slate-700 dark:bg-slate-700 light:bg-slate-300'
              }`}
            >
              <span
                className={`absolute top-0.5 size-4 rounded-full bg-white transition-transform ${
                  autoSave ? 'translate-x-[18px]' : 'translate-x-0.5'
                }`}
              />
              <span className="sr-only">Toggle auto-save</span>
            </button>
          </div>
        </section>

        {/* Vault Password (Epic 10) */}
        <section>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-slate-400 light:text-slate-500">
            Vault Password
          </h3>
          {!hasPassword ? (
            <div className="space-y-2">
              <p className="text-xs text-slate-500 light:text-slate-400">
                Set a password to lock individual notes. It encrypts locked notes and is never
                stored — there is no recovery if you forget it.
              </p>
              <button
                type="button"
                onClick={beginSetPassword}
                className="rounded-md bg-slate-800 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-700 dark:bg-slate-800 dark:text-slate-300 light:bg-slate-200 light:text-slate-700 light:hover:bg-slate-300"
              >
                Set vault password
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-xs text-slate-400 light:text-slate-500">
                {unlocked ? 'Vault unlocked this session' : 'Vault locked'}
              </span>
              {unlocked ? (
                <button
                  type="button"
                  onClick={lockVaultNow}
                  className="shrink-0 rounded-md bg-slate-800 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-700 dark:bg-slate-800 dark:text-slate-300 light:bg-slate-200 light:text-slate-700 light:hover:bg-slate-300"
                >
                  Lock vault now
                </button>
              ) : (
                <button
                  type="button"
                  onClick={beginUnlock}
                  className="shrink-0 rounded-md bg-slate-800 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-700 dark:bg-slate-800 dark:text-slate-300 light:bg-slate-200 light:text-slate-700 light:hover:bg-slate-300"
                >
                  Unlock vault
                </button>
              )}
            </div>
          )}
        </section>

        {/* Shortcuts */}
        <section>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-slate-400 light:text-slate-500">
            Shortcuts
          </h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-300 dark:text-slate-300 light:text-slate-700">
                Quick Capture
              </span>
              <kbd className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-400 dark:bg-slate-800 dark:text-slate-400 light:bg-slate-200 light:text-slate-600">
                {mod}+Shift+N
              </kbd>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-300 dark:text-slate-300 light:text-slate-700">
                Search
              </span>
              <kbd className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-400 dark:bg-slate-800 dark:text-slate-400 light:bg-slate-200 light:text-slate-600">
                {mod}+Shift+F
              </kbd>
            </div>
          </div>
        </section>

        {/* Maintenance */}
        <section>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-slate-400 light:text-slate-500">
            Maintenance
          </h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={rebuilding}
              onClick={async () => {
                setRebuilding(true)
                setRebuildStatus('idle')
                const result = await api.index.rebuild()
                setRebuilding(false)
                setRebuildStatus(result.ok ? 'success' : 'error')
              }}
              className="rounded-md bg-slate-800 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-300 light:bg-slate-200 light:text-slate-700 light:hover:bg-slate-300"
            >
              {rebuilding ? 'Rebuilding…' : 'Rebuild search index'}
            </button>
            {rebuildStatus === 'success' && (
              <span className="text-xs text-green-400 light:text-green-600">Done</span>
            )}
            {rebuildStatus === 'error' && (
              <span className="text-xs text-red-400 light:text-red-600">Failed</span>
            )}
          </div>
        </section>

        {/* Updates (Epic 12) */}
        <section>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-slate-400 light:text-slate-500">
            Updates
          </h3>
          <div className="flex flex-col gap-2">
            <span className="text-xs text-slate-500 light:text-slate-400">
              Current version: v{__APP_VERSION__}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={busyUpdate || update.status === 'dev-disabled'}
                onClick={() => {
                  setUpdate({ status: 'checking' })
                  void api.update.check()
                }}
                className="shrink-0 rounded-md bg-slate-800 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-300 light:bg-slate-200 light:text-slate-700 light:hover:bg-slate-300"
              >
                {update.status === 'checking' ? 'Checking…' : 'Check for updates'}
              </button>

              {/* Windows: a downloaded update can be installed with a restart. */}
              {update.status === 'downloaded' && (
                <button
                  type="button"
                  onClick={() => void api.update.install()}
                  className="shrink-0 rounded-md bg-accent-600 px-3 py-2 text-xs font-medium text-white shadow-sm shadow-accent-500/30 hover:bg-accent-500"
                >
                  Restart to update
                </button>
              )}

              {/* macOS: a newer release is available on the Releases page. */}
              {update.status === 'available' && update.url && (
                <button
                  type="button"
                  onClick={() => void api.update.openReleases(update.url)}
                  className="shrink-0 rounded-md bg-accent-600 px-3 py-2 text-xs font-medium text-white shadow-sm shadow-accent-500/30 hover:bg-accent-500"
                >
                  Open Releases
                </button>
              )}
            </div>

            {/* Status line */}
            {update.status === 'up-to-date' && (
              <span className="text-xs text-green-400 light:text-green-600">
                You're up to date.
              </span>
            )}
            {update.status === 'available' && (
              <span className="text-xs text-slate-400 light:text-slate-500">
                Version {update.version} is available
                {update.url ? '.' : ' — downloading…'}
              </span>
            )}
            {update.status === 'downloading' && (
              <span className="text-xs text-slate-400 light:text-slate-500">
                Downloading… {update.percent ?? 0}%
              </span>
            )}
            {update.status === 'downloaded' && (
              <span className="text-xs text-slate-400 light:text-slate-500">
                Version {update.version} downloaded — restart to install.
              </span>
            )}
            {update.status === 'dev-disabled' && (
              <span className="text-xs text-slate-500 light:text-slate-400">
                Updates are only available in the installed app.
              </span>
            )}
            {update.status === 'error' && (
              <span className="text-xs text-red-400 light:text-red-600">
                Update check failed: {update.error}
              </span>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
