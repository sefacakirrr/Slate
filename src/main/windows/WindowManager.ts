import { join } from 'node:path'
import { BrowserWindow, screen } from 'electron'
import type { SettingsService, StickyRecord } from '../services/SettingsService'

const isMac = process.platform === 'darwin'

export class WindowManager {
  private mainWindow: BrowserWindow | null = null
  private captureWindow: BrowserWindow | null = null
  private forceClosing = false
  // Sticky notes (Epic 11): one frameless always-on-top window per pinned note.
  private stickies = new Map<string, BrowserWindow>()
  private geometryTimers = new Map<string, NodeJS.Timeout>()
  private settings: SettingsService | null = null
  // Set on app before-quit so 'closed' handlers keep stickies in settings (for
  // restore) instead of treating quit as an unpin.
  private quitting = false

  /** Wire the settings service used for sticky persistence (called from main). */
  attachSettings(settings: SettingsService): void {
    this.settings = settings
  }

  getMainWindow(): BrowserWindow | null {
    return this.mainWindow
  }

  /**
   * Notifies every open window (main + stickies) that the vault changed, so each
   * refreshes its file list and stickies re-check their note still exists/unlocked.
   * Best-effort; skips destroyed windows.
   */
  broadcastFilesChanged(): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('vault:filesChanged')
    }
  }

  /**
   * Notifies every window that one note's *content* changed on disk (Epic 11
   * Phase 03), so a window showing that note can reload its editor if it isn't
   * dirty. Separate from `filesChanged` (which is about the file list).
   */
  broadcastNoteChanged(path: string): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('vault:noteChanged', path)
    }
  }

  createMainWindow(): BrowserWindow {
    this.mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      show: false,
      frame: isMac,
      titleBarStyle: isMac ? 'hiddenInset' : undefined,
      trafficLightPosition: isMac ? { x: 12, y: 12 } : undefined,
      backgroundColor: '#0a0e1a',
      autoHideMenuBar: true,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    })

    this.mainWindow.on('ready-to-show', () => {
      this.mainWindow?.show()
    })

    this.mainWindow.on('maximize', () =>
      this.mainWindow?.webContents.send('window:maximized', true),
    )
    this.mainWindow.on('unmaximize', () =>
      this.mainWindow?.webContents.send('window:maximized', false),
    )

    this.mainWindow.on('close', (event) => {
      if (this.forceClosing) return
      event.preventDefault()
      this.mainWindow?.webContents.send('window:confirmClose')
    })

    this.mainWindow.on('closed', () => {
      this.mainWindow = null
    })

    if (process.env.ELECTRON_RENDERER_URL) {
      this.mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
    } else {
      this.mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
    }

    return this.mainWindow
  }

  openQuickCapture(): void {
    if (this.captureWindow && !this.captureWindow.isDestroyed()) {
      this.captureWindow.focus()
      return
    }

    this.captureWindow = new BrowserWindow({
      width: 500,
      height: 260,
      show: false,
      frame: false,
      alwaysOnTop: true,
      resizable: false,
      skipTaskbar: true,
      vibrancy: isMac ? 'under-window' : undefined,
      backgroundColor: isMac ? undefined : '#0a0e1a',
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    })

    this.captureWindow.on('ready-to-show', () => {
      this.captureWindow?.show()
      this.captureWindow?.focus()
    })

    this.captureWindow.on('blur', () => {
      this.closeQuickCapture()
    })

    this.captureWindow.on('closed', () => {
      this.captureWindow = null
    })

    if (process.env.ELECTRON_RENDERER_URL) {
      this.captureWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}#/capture`)
    } else {
      this.captureWindow.loadFile(join(__dirname, '../renderer/index.html'), {
        hash: '/capture',
      })
    }
  }

  forceCloseMain(): void {
    this.forceClosing = true
    this.mainWindow?.close()
  }

  closeQuickCapture(): void {
    if (this.captureWindow && !this.captureWindow.isDestroyed()) {
      this.captureWindow.close()
    }
    this.captureWindow = null
  }

  // ── Sticky notes (Epic 11) ────────────────────────────────────────────────

  /**
   * Opens (or focuses) a sticky window for a note: frameless, always-on-top,
   * off the taskbar, resizable. Loads the shared renderer bundle at the
   * `#/sticky/<encoded path>` route. Geometry is persisted from this window's
   * own move/resize events (debounced) — never round-tripped through the renderer.
   */
  openSticky(path: string, bounds?: StickyRecord['bounds']): void {
    const existing = this.stickies.get(path)
    if (existing && !existing.isDestroyed()) {
      existing.focus()
      return
    }

    const width = bounds?.width ?? 320
    const height = bounds?.height ?? 320
    // A brand-new sticky opens at the top-right corner of the screen's work area
    // (with a small margin); a restored one uses its saved position.
    let x = bounds?.x
    let y = bounds?.y
    if (bounds === undefined) {
      const margin = 16
      const wa = screen.getPrimaryDisplay().workArea
      x = wa.x + wa.width - width - margin
      y = wa.y + margin
    }

    const win = new BrowserWindow({
      x,
      y,
      width,
      height,
      minWidth: 200,
      minHeight: 160,
      show: false,
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: true,
      vibrancy: isMac ? 'under-window' : undefined,
      backgroundColor: isMac ? undefined : '#0a0e1a',
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    })
    this.stickies.set(path, win)

    win.on('ready-to-show', () => win.show())
    const saveGeometry = () => this.debouncedSaveGeometry(path, win)
    win.on('move', saveGeometry)
    win.on('resize', saveGeometry)
    win.on('closed', () => {
      this.stickies.delete(path)
      const timer = this.geometryTimers.get(path)
      if (timer) {
        clearTimeout(timer)
        this.geometryTimers.delete(path)
      }
      // A user-initiated close unpins the note; an app-quit close must NOT (so
      // the sticky restores next launch).
      if (!this.quitting) {
        this.settings?.removeSticky(path).catch((err) => console.error('removeSticky failed:', err))
      }
    })

    // Record it in the persisted set from the moment it opens.
    this.settings
      ?.updateStickyGeometry(path, bounds ?? win.getBounds())
      .catch((err) => console.error('updateStickyGeometry failed:', err))

    const hash = `/sticky/${encodeURIComponent(path)}`
    if (process.env.ELECTRON_RENDERER_URL) {
      win.loadURL(`${process.env.ELECTRON_RENDERER_URL}#${hash}`)
    } else {
      win.loadFile(join(__dirname, '../renderer/index.html'), { hash })
    }
  }

  /** Closes a sticky by note path (its 'closed' handler unpins it). */
  closeSticky(path: string): void {
    const win = this.stickies.get(path)
    if (win && !win.isDestroyed()) win.close()
  }

  /**
   * Reopens persisted stickies on launch. `isValid` lets the caller skip notes
   * that no longer exist or are now locked; such entries are dropped from the set.
   */
  async restoreStickies(isValid: (path: string) => Promise<boolean>): Promise<void> {
    if (!this.settings) return
    const saved = await this.settings.getStickies()
    for (const sticky of saved) {
      if (await isValid(sticky.path)) {
        this.openSticky(sticky.path, sticky.bounds)
      } else {
        await this.settings.removeSticky(sticky.path).catch(() => {})
      }
    }
  }

  /**
   * Marks the app as quitting and flushes each live sticky's current geometry —
   * so a quit mid-session still records the latest positions and 'closed'
   * handlers keep the stickies persisted for restore.
   */
  markQuitting(): void {
    this.quitting = true
    for (const [path, win] of this.stickies) {
      if (!win.isDestroyed()) {
        this.settings
          ?.updateStickyGeometry(path, win.getBounds())
          .catch((err) => console.error('updateStickyGeometry on quit failed:', err))
      }
    }
  }

  private debouncedSaveGeometry(path: string, win: BrowserWindow): void {
    const prev = this.geometryTimers.get(path)
    if (prev) clearTimeout(prev)
    const timer = setTimeout(() => {
      this.geometryTimers.delete(path)
      if (win.isDestroyed()) return
      this.settings
        ?.updateStickyGeometry(path, win.getBounds())
        .catch((err) => console.error('updateStickyGeometry failed:', err))
    }, 400)
    this.geometryTimers.set(path, timer)
  }
}
