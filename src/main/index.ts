import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { app, BrowserWindow, ipcMain, net, protocol } from 'electron'
import { languageFromLocale, setMainLanguage, tm } from './i18n'
import { registerIpcHandlers } from './ipc/handlers'
import { installAppMenu } from './menu'
import { sendToOsTrash, TRASH_RETENTION_MS } from './osTrash'
import { AttachmentService } from './services/AttachmentService'
import { EncryptionService, isEncryptedPath } from './services/EncryptionService'
import { ExternalFileService, parseOpenPaths } from './services/ExternalFileService'
import { IndexService } from './services/IndexService'
import { ReminderService } from './services/ReminderService'
import { reconcileIndex } from './services/reconcile'
import { SearchService } from './services/SearchService'
import { SettingsService } from './services/SettingsService'
import { UpdateService } from './services/UpdateService'
import { VaultService } from './services/VaultService'
import { applyLaunchAtLogin, HIDDEN_FLAG, wasLaunchedHidden } from './windows/loginItem'
import { ShortcutManager } from './windows/ShortcutManager'
import { TrayManager } from './windows/TrayManager'
import { WindowManager } from './windows/WindowManager'

// Ensure userData resolves to ...\Roaming\Slate (not the lowercased package
// name) before any path is read.
app.setName('Slate')
// Windows notifications show this as the app name instead of "electron.app.Electron".
// Must equal electron-builder `appId` so toasts work with no window open.
app.setAppUserModelId('com.slate.app')

// Test-only isolation for the Playwright E2E suite (e2e/). Unset in normal use.
// SLATE_E2E_USER_DATA redirects userData (settings, index, single-instance lock)
// to a temp dir; it must run before anything reads userData. SLATE_E2E_VAULT
// preselects the vault. E2E runs also skip the tray, global shortcuts, and
// close-to-tray so they never touch the real desktop session or block quitting.
const e2eUserData = process.env.SLATE_E2E_USER_DATA
const isE2E = typeof e2eUserData === 'string' && e2eUserData !== ''
if (isE2E) app.setPath('userData', e2eUserData)

// One Slate per user. A second launch (e.g. Start-menu click while Slate sits in
// the tray) focuses the running instance instead of starting another.
const hasInstanceLock = app.requestSingleInstanceLock()
if (!hasInstanceLock) app.quit()

const windowManager = new WindowManager()
const shortcutManager = new ShortcutManager()
const trayManager = new TrayManager()

// Files opened from the OS ("Open with", double-click, macOS open-file). argv
// holds the executable first, plus the app path in dev (`electron .`).
const ARGV_SKIP = process.defaultApp ? 2 : 1
// Paths requested before main is ready to resolve them (cold start argv, an
// early open-file/second-instance); drained when the main window is created.
const pendingOpenPaths: string[] = parseOpenPaths(process.argv, {
  cwd: process.cwd(),
  skip: ARGV_SKIP,
})
let openPathsHandler: ((paths: string[]) => void) | null = null
function requestOpenPaths(paths: string[]): void {
  if (paths.length === 0) return
  if (openPathsHandler) openPathsHandler(paths)
  else pendingOpenPaths.push(...paths)
}

// macOS delivers files via open-file (possibly before 'ready'), not argv.
app.on('open-file', (event, filePath) => {
  event.preventDefault()
  requestOpenPaths([filePath])
})

app.on('second-instance', (_event, argv, workingDirectory) => {
  const paths = parseOpenPaths(argv, { cwd: workingDirectory, skip: ARGV_SKIP })
  if (paths.length > 0) {
    requestOpenPaths(paths)
    return
  }
  if (!app.isReady() || argv.includes(HIDDEN_FLAG)) return
  windowManager.showMain()
})
let index: IndexService | null = null
let reminder: ReminderService | null = null

protocol.registerSchemesAsPrivileged([
  { scheme: 'slate-attachment', privileges: { stream: true, supportFetchAPI: true } },
])

app.whenReady().then(async () => {
  if (!hasInstanceLock) return
  const userData = app.getPath('userData')
  const settings = new SettingsService(join(userData, 'settings.json'))
  // UI language: the saved choice, else the OS locale on first run.
  setMainLanguage((await settings.getLanguage()) ?? languageFromLocale(app.getLocale()))
  // Replace Electron's default menu: its undo/redo roles trigger Chromium's
  // native contenteditable undo, which corrupts the editor DOM (see menu.ts).
  installAppMenu()
  const e2eVault = process.env.SLATE_E2E_VAULT
  if (isE2E && e2eVault) await settings.setVaultPath(resolve(e2eVault))

  // Custom protocol to serve vault attachments safely.
  // URL format: slate-attachment:///<relative-path-inside-vault>
  protocol.handle('slate-attachment', async (request) => {
    const url = new URL(request.url)
    const relativePath = decodeURIComponent(url.pathname).replace(/^\/+/, '')
    const vaultPath = settings.getVaultPathSync()
    if (!vaultPath) {
      return new Response('No vault configured', { status: 404 })
    }
    const absPath = resolve(vaultPath, relativePath)
    // Path safety: must stay inside vault
    const vaultRoot = resolve(vaultPath)
    if (!absPath.startsWith(vaultRoot)) {
      return new Response('Path outside vault', { status: 403 })
    }
    return net.fetch(pathToFileURL(absPath).href)
  })
  // The FTS index is derived/rebuildable and lives in userData, never the vault.
  const idx = new IndexService(join(userData, 'index.db'))
  index = idx // module-scoped handle so will-quit can close it
  const search = new SearchService(idx.connection)
  const attachment = new AttachmentService(() => {
    const cached = settings.getVaultPathSync()
    return cached
  })
  // Holds the vault session key in memory only (Epic 10). No disk/keychain.
  const encryption = new EncryptionService()
  // Sticky windows (Epic 11) persist their geometry through settings.
  windowManager.attachSettings(settings)
  // In-app updates (Epic 12): push state to the main window's renderer.
  const update = new UpdateService((state) => {
    const win = windowManager.getMainWindow()
    if (win && !win.isDestroyed()) win.webContents.send('update:state', state)
  })

  // Calendar & Reminders (Epic 16): scheduler + native notifications.
  reminder = new ReminderService({
    settings,
    onFire: (payload) => {
      const win = windowManager.getMainWindow()
      if (win && !win.isDestroyed()) win.webContents.send('reminder:fired', payload)
    },
    getMainWindow: () => windowManager.getMainWindow(),
    showMainWindow: () => windowManager.showMain(),
  })

  // Files opened from outside the vault: read/write allowlist + open queue.
  // Re-allow the external tabs still open last session so they restore.
  const external = new ExternalFileService()
  external.restore(await settings.getExternalFiles())

  registerIpcHandlers(ipcMain, {
    settings,
    index: idx,
    search,
    attachment,
    encryption,
    external,
    update,
    reminder,
    windowManager,
    getMainWindow: () => windowManager.getMainWindow(),
    onLanguageChanged: (language) => {
      installAppMenu()
      trayManager.refresh()
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) win.webContents.send('language:changed', language)
      }
    },
  })

  // Tray + close-to-tray + launch-at-login keep reminders firing with no window.
  const [closeToTray, launchAtLogin] = await Promise.all([
    settings.getCloseToTray(),
    settings.getLaunchAtLogin(),
  ])
  windowManager.setCloseToTray(closeToTray && !isE2E)
  if (!isE2E) applyLaunchAtLogin(launchAtLogin)
  // Started by the login item: create the window (renderer ready for toasts and
  // reminder navigation) but leave it hidden — the tray is the entry point.
  // A cold start that opens a file always shows the window, even from --hidden.
  const coldOpenPaths = pendingOpenPaths.splice(0)
  windowManager.createMainWindow({ show: !wasLaunchedHidden() || coldOpenPaths.length > 0 })

  // Resolve requested paths (vault tab vs allowlisted external tab), queue them
  // for the renderer, and nudge it to drain. The renderer also drains on
  // subscribe, so a request made while it is still loading is not lost.
  const deliverOpenPaths = async (paths: string[], show: boolean): Promise<void> => {
    try {
      external.enqueue(await external.resolveOpen(paths, await settings.getVaultPath()))
      const win = show ? windowManager.showMain() : windowManager.getMainWindow()
      if (win && !win.isDestroyed()) win.webContents.send('external:openRequested')
    } catch (err) {
      console.error('open external files failed:', err)
    }
  }
  if (coldOpenPaths.length > 0) void deliverOpenPaths(coldOpenPaths, false)
  openPathsHandler = (paths) => void deliverOpenPaths(paths, true)

  if (!isE2E) {
    trayManager.create({
      open: () => windowManager.showMain(),
      quit: () => app.quit(),
    })
  }

  // Check for updates silently; user gets a native notification when one is
  // ready and the new version installs on the next app restart. Goes through
  // UpdateService so the in-app update UI also sees a launch-time download.
  update.checkOnLaunch()

  const openQuickCapture = () => windowManager.openQuickCapture()
  if (!isE2E) {
    shortcutManager.register('quick-capture', 'CmdOrCtrl+Shift+N', openQuickCapture)
  } else {
    // E2E hook: specs trigger what the (unregistered) global shortcut would.
    Object.assign(globalThis, {
      __slateE2E: {
        openQuickCapture,
        closeQuickCapture: () => windowManager.closeQuickCapture(),
        // i18n spec: the strings the tray would show (the tray itself is skipped under E2E).
        trayLabels: () => [tm('tray.tooltip'), tm('tray.open'), tm('tray.quit')],
      },
    })
  }

  // Initialize reminders: fires past-due ones, schedules upcoming.
  reminder.init().catch((err) => console.error('reminder init failed:', err))

  // Self-heal the index against on-disk changes made while the app was closed.
  // Best-effort and non-blocking — the window shows immediately; incremental
  // hooks keep the index fresh during the session regardless.
  settings
    .getVaultPath()
    .then((vaultPath) => {
      if (vaultPath !== null) return reconcileIndex(new VaultService(vaultPath), idx)
    })
    .catch((err) => console.error('index reconciliation failed:', err))

  // Auto-purge in-vault trash items older than 30 days. Copies whose original is
  // already in the OS recycle bin are removed; only-copies go to the OS trash.
  settings
    .getVaultPath()
    .then((vaultPath) => {
      if (vaultPath !== null) {
        return new VaultService(vaultPath).purgeTrash(TRASH_RETENTION_MS, sendToOsTrash)
      }
    })
    .catch((err) => console.error('trash purge failed:', err))

  // Restore pinned sticky notes (Epic 11). Skip a note that no longer exists or
  // is now locked (locked notes can't be stickies in v1).
  const isPinnable = async (notePath: string): Promise<boolean> => {
    if (isEncryptedPath(notePath)) return false
    const vaultPath = await settings.getVaultPath()
    if (vaultPath === null) return false
    try {
      await new VaultService(vaultPath).statMtime(notePath)
      return true
    } catch {
      return false
    }
  }
  windowManager
    .restoreStickies(isPinnable)
    .catch((err) => console.error('sticky restore failed:', err))

  app.on('activate', () => {
    // Check the MAIN window specifically, not total window count: with a sticky
    // open but the main window closed (macOS keeps the app alive), getAllWindows()
    // is non-empty, so the dock icon must still be able to reopen the main window.
    // showMain() recreates it if destroyed and un-hides it after close-to-tray.
    windowManager.showMain()
  })
})

// Before windows start closing, mark quitting so sticky 'closed' handlers keep
// them persisted (for restore) and flush their latest geometry.
app.on('before-quit', () => {
  windowManager.markQuitting()
})

app.on('will-quit', () => {
  shortcutManager.unregisterAll()
  reminder?.dispose()
  trayManager.destroy()
  index?.close()
})

app.on('window-all-closed', () => {
  // With close-to-tray on, the main window only hides, so this is reached when a
  // real quit is under way or close-to-tray is off. A quit that was held up by
  // the unsaved-changes prompt completes here on macOS too.
  if (windowManager.isQuitting() || process.platform !== 'darwin') app.quit()
})
