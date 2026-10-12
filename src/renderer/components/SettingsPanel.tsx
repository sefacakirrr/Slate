import { api } from '@renderer/api'
import { BackgroundPositionModal } from '@renderer/components/BackgroundPositionModal'
import { ConfirmDialog } from '@renderer/components/ConfirmDialog'
import { ImportWizard } from '@renderer/components/ImportWizard'
import { type TKey, useLanguage, useT } from '@renderer/i18n'
import { setLanguage } from '@renderer/i18n/init'
import { useEncryptionStore } from '@renderer/stores/encryptionStore'
import { useThemeStore } from '@renderer/stores/themeStore'
import { useVaultStore } from '@renderer/stores/vaultStore'
import { useWorkspaceStore } from '@renderer/stores/workspaceStore'
import type { Language, ThemeMode, UpdateState } from '@shared/types'
import { Upload, X } from 'lucide-react'
import { useEffect, useState } from 'react'

const mod = api.platform === 'darwin' ? '⌘' : 'Ctrl'

const THEME_OPTIONS: { value: ThemeMode; label: TKey }[] = [
  { value: 'dark', label: 'settings.theme.dark' },
  { value: 'light', label: 'settings.theme.light' },
  { value: 'system', label: 'settings.theme.system' },
]

const LANGUAGE_OPTIONS: { value: Language; label: TKey }[] = [
  { value: 'en', label: 'common.language.en' },
  { value: 'tr', label: 'common.language.tr' },
]

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const t = useT()
  const language = useLanguage()
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const pickAndSetVault = useVaultStore((s) => s.pickAndSetVault)
  const theme = useThemeStore((s) => s.theme)
  const setTheme = useThemeStore((s) => s.setTheme)
  const colorThemeId = useThemeStore((s) => s.colorThemeId)
  const setColorTheme = useThemeStore((s) => s.setColorTheme)
  const allThemes = useThemeStore((s) => s.allThemes)
  const importTheme = useThemeStore((s) => s.importTheme)
  const customThemes = useThemeStore((s) => s.customThemes)
  const removeCustomTheme = useThemeStore((s) => s.removeCustomTheme)
  const [themeToRemove, setThemeToRemove] = useState<{ id: string; name: string } | null>(null)
  const backgroundImage = useThemeStore((s) => s.backgroundImage)
  const backgroundOpacity = useThemeStore((s) => s.backgroundOpacity)
  const setBackgroundImage = useThemeStore((s) => s.setBackgroundImage)
  const setBackgroundOpacity = useThemeStore((s) => s.setBackgroundOpacity)
  const backgroundPosition = useThemeStore((s) => s.backgroundPosition)
  const setBackgroundPosition = useThemeStore((s) => s.setBackgroundPosition)
  const backgroundScale = useThemeStore((s) => s.backgroundScale)
  const setBackgroundScale = useThemeStore((s) => s.setBackgroundScale)
  const fontSize = useThemeStore((s) => s.fontSize)
  const setFontSize = useThemeStore((s) => s.setFontSize)
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
  const [showImport, setShowImport] = useState(false)
  const [pendingBgImage, setPendingBgImage] = useState<string | null>(null)
  const [bgNotStored, setBgNotStored] = useState(false)

  // Subscribe to update-state pushes from main (Epic 12).
  useEffect(() => api.update.onState(setUpdate), [])

  // Background behavior: launch at login + close to tray (keeps reminders alive).
  const [launchAtLogin, setLaunchAtLogin] = useState(true)
  const [closeToTray, setCloseToTray] = useState(true)
  useEffect(() => {
    void api.settings.getLaunchAtLogin().then((r) => r.ok && setLaunchAtLogin(r.data))
    void api.settings.getCloseToTray().then((r) => r.ok && setCloseToTray(r.data))
  }, [])
  const toggleLaunchAtLogin = async () => {
    const next = !launchAtLogin
    setLaunchAtLogin(next)
    const r = await api.settings.setLaunchAtLogin(next)
    if (!r.ok) setLaunchAtLogin(!next)
  }
  const toggleCloseToTray = async () => {
    const next = !closeToTray
    setCloseToTray(next)
    const r = await api.settings.setCloseToTray(next)
    if (!r.ok) setCloseToTray(!next)
  }

  const busyUpdate = update.status === 'checking' || update.status === 'downloading'

  return (
    <div className="flex h-full flex-col bg-slate-950 dark:bg-slate-950 light:bg-white">
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3 dark:border-slate-800 light:border-slate-200">
        <h2 className="text-sm font-semibold text-slate-200 dark:text-slate-200 light:text-slate-800">
          {t('settings.title')}
        </h2>
        <button
          type="button"
          onClick={onClose}
          title={t('common.close')}
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
            {t('settings.theme.heading')}
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
                {t(opt.label)}
              </button>
            ))}
          </div>
        </section>

        {/* Language: same segmented control as Theme. */}
        <section>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-slate-400 light:text-slate-500">
            {t('common.language.label')}
          </h3>
          <div className="flex gap-1 rounded-lg bg-slate-900 p-1 dark:bg-slate-900 light:bg-slate-100">
            {LANGUAGE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                aria-pressed={language === opt.value}
                onClick={() => void setLanguage(opt.value)}
                className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  language === opt.value
                    ? 'bg-accent-600 text-white'
                    : 'text-slate-400 hover:text-slate-200 dark:text-slate-400 dark:hover:text-slate-200 light:text-slate-600 light:hover:text-slate-800'
                }`}
              >
                {t(opt.label)}
              </button>
            ))}
          </div>
        </section>

        {/* Color Theme */}
        <section>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-slate-400 light:text-slate-500">
            {t('settings.colorTheme.heading')}
          </h3>
          <div className="grid grid-cols-3 gap-1.5">
            {allThemes().map((ct) => (
              <div key={ct.id} className="group relative">
                <button
                  type="button"
                  onClick={() => setColorTheme(ct.id)}
                  className={`w-full rounded-md px-2 py-1.5 text-xs font-medium transition-colors border ${
                    colorThemeId === ct.id
                      ? 'border-accent-500 bg-accent-600/20 text-accent-300'
                      : 'border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200 dark:border-slate-700 light:border-slate-200 light:text-slate-600 light:hover:text-slate-800'
                  }`}
                >
                  <span
                    className="mr-1.5 inline-block size-2 rounded-full"
                    style={{ backgroundColor: ct.colors.cursor }}
                  />
                  {ct.name}
                </button>
                {/* Imported themes only: built-ins can't be removed. */}
                {customThemes.some((c) => c.id === ct.id) && (
                  <button
                    type="button"
                    onClick={() => setThemeToRemove({ id: ct.id, name: ct.name })}
                    aria-label={t('settings.colorTheme.removeAria', { name: ct.name })}
                    title={t('settings.colorTheme.removeTitle')}
                    className="absolute -right-1 -top-1 hidden size-4 items-center justify-center rounded-full bg-slate-700 text-slate-200 shadow hover:bg-red-600 hover:text-white focus-visible:flex group-hover:flex light:bg-slate-300 light:text-slate-700"
                  >
                    <X className="size-2.5" aria-hidden="true" />
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              const input = document.createElement('input')
              input.type = 'file'
              input.accept = '.json'
              input.onchange = () => {
                const file = input.files?.[0]
                if (!file) return
                const reader = new FileReader()
                reader.onload = () => {
                  try {
                    const json = JSON.parse(reader.result as string)
                    const result = importTheme(json)
                    if (!result) alert(t('settings.colorTheme.invalidFile'))
                  } catch {
                    alert(t('settings.colorTheme.parseError'))
                  }
                }
                reader.readAsText(file)
              }
              input.click()
            }}
            className="mt-2 flex items-center gap-1.5 rounded-md bg-slate-800 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-700 dark:bg-slate-800 dark:text-slate-300 light:bg-slate-200 light:text-slate-700 light:hover:bg-slate-300"
          >
            <Upload className="size-3" />
            {t('settings.colorTheme.import')}
          </button>
        </section>

        {/* Background Image */}
        <section>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-slate-400 light:text-slate-500">
            {t('settings.backgroundImage.heading')}
          </h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const input = document.createElement('input')
                input.type = 'file'
                input.accept = 'image/*'
                input.onchange = () => {
                  const file = input.files?.[0]
                  if (!file) return
                  const reader = new FileReader()
                  reader.onload = () => setPendingBgImage(reader.result as string)
                  reader.readAsDataURL(file)
                }
                input.click()
              }}
              className="rounded-md bg-slate-800 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-700 dark:bg-slate-800 dark:text-slate-300 light:bg-slate-200 light:text-slate-700 light:hover:bg-slate-300"
            >
              {backgroundImage
                ? t('settings.backgroundImage.change')
                : t('settings.backgroundImage.select')}
            </button>
            {backgroundImage && (
              <button
                type="button"
                onClick={() => {
                  setBackgroundImage(null)
                  setBgNotStored(false)
                }}
                className="rounded-md bg-red-900/40 px-3 py-2 text-xs font-medium text-red-300 hover:bg-red-900/60"
              >
                {t('settings.backgroundImage.remove')}
              </button>
            )}
          </div>
          {bgNotStored && backgroundImage && (
            <p role="alert" className="mt-2 text-xs text-red-400 light:text-red-600">
              {t('settings.backgroundImage.tooLarge')}
            </p>
          )}
          {backgroundImage && (
            <div className="mt-3 space-y-3">
              <label className="block text-xs text-slate-400">
                <span>
                  {t('settings.backgroundImage.opacity', {
                    percent: Math.round(backgroundOpacity * 100),
                  })}
                </span>
                <input
                  type="range"
                  min="0.05"
                  max="0.5"
                  step="0.05"
                  value={backgroundOpacity}
                  onChange={(e) => setBackgroundOpacity(Number(e.target.value))}
                  className="mt-1 w-full accent-accent-500"
                />
              </label>
              <button
                type="button"
                onClick={() => setPendingBgImage(backgroundImage)}
                className="rounded-md bg-slate-800 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-700 light:bg-slate-200 light:text-slate-700 light:hover:bg-slate-300"
              >
                {t('settings.backgroundImage.reposition')}
              </button>
            </div>
          )}
        </section>

        {/* Vault */}
        <section>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-slate-400 light:text-slate-500">
            {t('settings.vault.heading')}
          </h3>
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate rounded bg-slate-900 px-3 py-2 text-xs text-slate-300 dark:bg-slate-900 dark:text-slate-300 light:bg-slate-100 light:text-slate-700">
              {vaultPath ?? t('settings.vault.none')}
            </span>
            <button
              type="button"
              onClick={pickAndSetVault}
              className="shrink-0 rounded-md bg-slate-800 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-700 dark:bg-slate-800 dark:text-slate-300 light:bg-slate-200 light:text-slate-700 light:hover:bg-slate-300"
            >
              {t('settings.vault.change')}
            </button>
          </div>
        </section>

        {/* Import (Epic 15) */}
        <section>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-slate-400 light:text-slate-500">
            {t('settings.import.heading')}
          </h3>
          <div className="space-y-2">
            <p className="text-xs text-slate-500 light:text-slate-400">
              {t('settings.import.description')}
            </p>
            <button
              type="button"
              disabled={vaultPath === null}
              onClick={() => setShowImport(true)}
              className="rounded-md bg-slate-800 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-300 light:bg-slate-200 light:text-slate-700 light:hover:bg-slate-300"
            >
              {t('settings.import.button')}
            </button>
          </div>
        </section>

        {/* Editing (Epic 13) */}
        <section>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-slate-400 light:text-slate-500">
            {t('settings.editing.heading')}
          </h3>
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <span className="text-xs text-slate-300 dark:text-slate-300 light:text-slate-700">
                {t('settings.editing.autoSave')}
              </span>
              <p className="text-xs text-slate-500 light:text-slate-400">
                {t('settings.editing.autoSaveDescription', { mod })}
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
                className={`absolute left-0.5 top-0.5 size-4 rounded-full bg-white transition-transform ${
                  autoSave ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
              <span className="sr-only">{t('settings.editing.toggleAutoSave')}</span>
            </button>
          </div>
          <div className="mt-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-300 dark:text-slate-300 light:text-slate-700">
                {t('settings.editing.fontSize')}
              </span>
              <span className="text-xs tabular-nums text-slate-400">{fontSize}px</span>
            </div>
            <input
              type="range"
              min={11}
              max={24}
              step={1}
              value={fontSize}
              onChange={(e) => setFontSize(Number(e.target.value))}
              className="mt-1 w-full accent-accent-500"
            />
            <p className="mt-0.5 text-xs text-slate-500 light:text-slate-400">
              {t('settings.editing.fontSizeDescription', { mod })}
            </p>
          </div>
        </section>

        {/* Background (tray + launch at login) */}
        <section>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-slate-400 light:text-slate-500">
            {t('settings.background.heading')}
          </h3>
          <div className="space-y-3">
            <SettingSwitch
              label={t('settings.background.launchAtLogin')}
              description={t('settings.background.launchAtLoginDescription')}
              checked={launchAtLogin}
              onToggle={() => void toggleLaunchAtLogin()}
            />
            <SettingSwitch
              label={t('settings.background.closeToTray')}
              description={t('settings.background.closeToTrayDescription')}
              checked={closeToTray}
              onToggle={() => void toggleCloseToTray()}
            />
          </div>
        </section>

        {/* Vault Password (Epic 10) */}
        <section>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-slate-400 light:text-slate-500">
            {t('settings.password.heading')}
          </h3>
          {!hasPassword ? (
            <div className="space-y-2">
              <p className="text-xs text-slate-500 light:text-slate-400">
                {t('settings.password.description')}
              </p>
              <button
                type="button"
                onClick={beginSetPassword}
                className="rounded-md bg-slate-800 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-700 dark:bg-slate-800 dark:text-slate-300 light:bg-slate-200 light:text-slate-700 light:hover:bg-slate-300"
              >
                {t('settings.password.set')}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-xs text-slate-400 light:text-slate-500">
                {unlocked ? t('settings.password.unlocked') : t('settings.password.locked')}
              </span>
              {unlocked ? (
                <button
                  type="button"
                  onClick={lockVaultNow}
                  className="shrink-0 rounded-md bg-slate-800 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-700 dark:bg-slate-800 dark:text-slate-300 light:bg-slate-200 light:text-slate-700 light:hover:bg-slate-300"
                >
                  {t('settings.password.lockNow')}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={beginUnlock}
                  className="shrink-0 rounded-md bg-slate-800 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-700 dark:bg-slate-800 dark:text-slate-300 light:bg-slate-200 light:text-slate-700 light:hover:bg-slate-300"
                >
                  {t('settings.password.unlock')}
                </button>
              )}
            </div>
          )}
        </section>

        {/* Shortcuts */}
        <section>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-slate-400 light:text-slate-500">
            {t('settings.shortcuts.heading')}
          </h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-300 dark:text-slate-300 light:text-slate-700">
                {t('settings.shortcuts.quickCapture')}
              </span>
              <kbd className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-400 dark:bg-slate-800 dark:text-slate-400 light:bg-slate-200 light:text-slate-600">
                {mod}+Shift+N
              </kbd>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-300 dark:text-slate-300 light:text-slate-700">
                {t('settings.shortcuts.search')}
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
            {t('settings.maintenance.heading')}
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
              {rebuilding
                ? t('settings.maintenance.rebuilding')
                : t('settings.maintenance.rebuild')}
            </button>
            {rebuildStatus === 'success' && (
              <span className="text-xs text-green-400 light:text-green-600">
                {t('settings.maintenance.done')}
              </span>
            )}
            {rebuildStatus === 'error' && (
              <span className="text-xs text-red-400 light:text-red-600">
                {t('settings.maintenance.failed')}
              </span>
            )}
          </div>
        </section>

        {/* Updates (Epic 12) */}
        <section>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-slate-400 light:text-slate-500">
            {t('settings.updates.heading')}
          </h3>
          <div className="flex flex-col gap-2">
            <span className="text-xs text-slate-500 light:text-slate-400">
              {t('settings.updates.currentVersion', { version: __APP_VERSION__ })}
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
                {update.status === 'checking'
                  ? t('settings.updates.checking')
                  : t('settings.updates.check')}
              </button>

              {/* Windows: a downloaded update can be installed with a restart. */}
              {update.status === 'downloaded' && (
                <button
                  type="button"
                  onClick={() => void api.update.install()}
                  className="shrink-0 rounded-md bg-accent-600 px-3 py-2 text-xs font-medium text-white shadow-sm shadow-accent-500/30 hover:bg-accent-500"
                >
                  {t('settings.updates.restartToUpdate')}
                </button>
              )}

              {/* macOS: a newer release is available on the Releases page. */}
              {update.status === 'available' && update.url && (
                <button
                  type="button"
                  onClick={() => void api.update.openReleases(update.url)}
                  className="shrink-0 rounded-md bg-accent-600 px-3 py-2 text-xs font-medium text-white shadow-sm shadow-accent-500/30 hover:bg-accent-500"
                >
                  {t('settings.updates.openReleases')}
                </button>
              )}
            </div>

            {/* Status line */}
            {update.status === 'up-to-date' && (
              <span className="text-xs text-green-400 light:text-green-600">
                {t('settings.updates.upToDate')}
              </span>
            )}
            {update.status === 'available' && (
              <span className="text-xs text-slate-400 light:text-slate-500">
                {t(
                  update.url
                    ? 'settings.updates.available'
                    : 'settings.updates.availableDownloading',
                  { version: update.version ?? '' },
                )}
              </span>
            )}
            {update.status === 'downloading' && (
              <span className="text-xs text-slate-400 light:text-slate-500">
                {t('settings.updates.downloading', { percent: update.percent ?? 0 })}
              </span>
            )}
            {update.status === 'downloaded' && (
              <span className="text-xs text-slate-400 light:text-slate-500">
                {t('settings.updates.downloaded', { version: update.version ?? '' })}
              </span>
            )}
            {/* What's new: release-notes summary for the offered version. */}
            {(update.status === 'available' ||
              update.status === 'downloading' ||
              update.status === 'downloaded') &&
              'notes' in update &&
              update.notes && (
                <div className="rounded-md bg-slate-900 px-3 py-2 dark:bg-slate-900 light:bg-slate-100">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500 light:text-slate-400">
                    {t('settings.updates.whatsNew')}
                  </p>
                  <p className="whitespace-pre-line text-xs leading-relaxed text-slate-400 light:text-slate-600">
                    {update.notes}
                  </p>
                </div>
              )}
            {update.status === 'dev-disabled' && (
              <span className="text-xs text-slate-500 light:text-slate-400">
                {t('settings.updates.devDisabled')}
              </span>
            )}
            {update.status === 'error' && (
              <span className="text-xs text-red-400 light:text-red-600">
                {t('settings.updates.error', { error: update.error ?? '' })}
              </span>
            )}
            <p className="mt-2 text-[11px] text-slate-600 light:text-slate-400">
              {t('settings.updates.silentNote')}
            </p>
          </div>
        </section>
      </div>

      {showImport && <ImportWizard onClose={() => setShowImport(false)} />}

      <ConfirmDialog
        open={themeToRemove !== null}
        title={t('settings.colorTheme.removeDialogTitle')}
        message={t('settings.colorTheme.removeDialogMessage', { name: themeToRemove?.name ?? '' })}
        confirmLabel={t('settings.colorTheme.removeDialogConfirm')}
        onConfirm={() => {
          if (themeToRemove) removeCustomTheme(themeToRemove.id)
          setThemeToRemove(null)
        }}
        onCancel={() => setThemeToRemove(null)}
      />

      {pendingBgImage && (
        <BackgroundPositionModal
          imageDataUrl={pendingBgImage}
          initialPosition={backgroundPosition}
          initialScale={backgroundScale}
          onConfirm={(pos, scl) => {
            setBgNotStored(!setBackgroundImage(pendingBgImage))
            setBackgroundPosition(pos)
            setBackgroundScale(scl)
            setPendingBgImage(null)
          }}
          onCancel={() => setPendingBgImage(null)}
        />
      )}
    </div>
  )
}

/** On/off row matching the Auto-save toggle style. */
function SettingSwitch({
  label,
  description,
  checked,
  onToggle,
}: {
  label: string
  description: string
  checked: boolean
  onToggle: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <span className="text-xs text-slate-300 dark:text-slate-300 light:text-slate-700">
          {label}
        </span>
        <p className="text-xs text-slate-500 light:text-slate-400">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={onToggle}
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
          checked ? 'bg-accent-600' : 'bg-slate-700 dark:bg-slate-700 light:bg-slate-300'
        }`}
      >
        <span
          className={`absolute left-0.5 top-0.5 size-4 rounded-full bg-white transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  )
}
