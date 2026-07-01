import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { app, BrowserWindow, ipcMain, net, protocol } from 'electron'
import { autoUpdater } from 'electron-updater'
import { registerIpcHandlers } from './ipc/handlers'
import { AttachmentService } from './services/AttachmentService'
import { EncryptionService } from './services/EncryptionService'
import { IndexService } from './services/IndexService'
import { reconcileIndex } from './services/reconcile'
import { SearchService } from './services/SearchService'
import { SettingsService } from './services/SettingsService'
import { VaultService } from './services/VaultService'
import { ShortcutManager } from './windows/ShortcutManager'
import { WindowManager } from './windows/WindowManager'

// Ensure userData resolves to ...\Roaming\Slate (not the lowercased package
// name) before any path is read.
app.setName('Slate')

const windowManager = new WindowManager()
const shortcutManager = new ShortcutManager()
let index: IndexService | null = null

protocol.registerSchemesAsPrivileged([
  { scheme: 'slate-attachment', privileges: { stream: true, supportFetchAPI: true } },
])

app.whenReady().then(async () => {
  const userData = app.getPath('userData')
  const settings = new SettingsService(join(userData, 'settings.json'))

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

  registerIpcHandlers(ipcMain, {
    settings,
    index: idx,
    search,
    attachment,
    encryption,
    windowManager,
    getMainWindow: () => windowManager.getMainWindow(),
  })

  windowManager.createMainWindow()

  // Check for updates silently; user gets a native notification when one is
  // ready and the new version installs on the next app restart.
  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify().catch((err) =>
      console.error('auto-update check failed:', err),
    )
  }

  shortcutManager.register('quick-capture', 'CmdOrCtrl+Shift+N', () => {
    windowManager.openQuickCapture()
  })

  // Self-heal the index against on-disk changes made while the app was closed.
  // Best-effort and non-blocking — the window shows immediately; incremental
  // hooks keep the index fresh during the session regardless.
  settings
    .getVaultPath()
    .then((vaultPath) => {
      if (vaultPath !== null) return reconcileIndex(new VaultService(vaultPath), idx)
    })
    .catch((err) => console.error('index reconciliation failed:', err))

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) windowManager.createMainWindow()
  })
})

app.on('will-quit', () => {
  shortcutManager.unregisterAll()
  index?.close()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
