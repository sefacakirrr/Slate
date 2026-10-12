import { join } from 'node:path'
import { BrowserWindow, screen } from 'electron'
import type { SettingsService, StickyRecord } from '../services/SettingsService'

const isMac = process.platform === 'darwin'

/**
 * Never let a window navigate away from the app page: dropping a file that the
 * page did not handle would otherwise make Chromium open it in place of the UI.
 * Same-URL navigations (reloads, hash routes) are allowed.
 */
function blockForeignNavigation(win: BrowserWindow): void {
  win.webContents.on('will-navigate', (event, url) => {
    const strip = (u: string) => u.split('#')[0]
    if (strip(url) !== strip(win.webContents.getURL())) event.preventDefault()
  })
}

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
  /** Closing the main window hides it (app keeps running in the tray). */
  private closeToTray = true

  /** Wire the settings service used for sticky persistence (called from main). */
  attachSettings(settings: SettingsService): void {
    this.settings = settings
  }

  getMainWindow(): BrowserWindow | null {
    return this.mainWindow
  }

  setCloseToTray(enabled: boolean): void {
    this.closeToTray = enabled
  }

  isQuitting(): boolean {
    return this.quitting
  }

  /** Shows and focuses the main window, recreating it if it was destroyed. */
  showMain(): BrowserWindow {
    const win =
      this.mainWindow && !this.mainWindow.isDestroyed() ? this.mainWindow : this.createMainWindow()
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
    return win
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

  broadcastThemeChanged(theme: string): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('theme:changed', theme)
    }
  }

  /** `show: false` keeps the window hidden (launch-at-login starts in the tray). */
  createMainWindow(opts: { show?: boolean } = {}): BrowserWindow {
    const showOnReady = opts.show !== false
    this.forceClosing = false
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

    blockForeignNavigation(this.mainWindow)
    this.mainWindow.on('ready-to-show', () => {
      if (showOnReady) this.mainWindow?.show()
    })

    this.mainWindow.on('maximize', () => {
      if (this.mainWindow && !this.mainWindow.isDestroyed())
        this.mainWindow.webContents.send('window:maximized', true)
    })
    this.mainWindow.on('unmaximize', () => {
      if (this.mainWindow && !this.mainWindow.isDestroyed())
        this.mainWindow.webContents.send('window:maximized', false)
    })

    this.mainWindow.on('close', (event) => {
      if (this.forceClosing) return
      const win = this.mainWindow
      if (!win || win.isDestroyed()) return
      // Close-to-tray: hide instead of closing. Nothing is lost — the renderer
      // (and its unsaved tabs) stays alive — so no unsaved-changes prompt here.
      if (this.closeToTray && !this.quitting) {
        event.preventDefault()
        win.hide()
        return
      }
      // A renderer that is still loading or has crashed can never answer the
      // confirm round-trip; let the close proceed so quit doesn't hang.
      if (win.webContents.isLoading() || win.webContents.isCrashed()) return
      event.preventDefault()
      win.webContents.send('window:confirmClose')
      // Quitting from the tray with the window hidden: if the renderer is still
      // asking about unsaved changes shortly after, bring the window up so the
      // dialog is visible (a clean renderer force-closes before this fires).
      if (this.quitting && !win.isVisible()) {
        setTimeout(() => {
          if (!win.isDestroyed() && !win.isVisible()) win.show()
        }, 300)
      }
    })

    // Windows logoff/shutdown: treat as a real quit, never hide-to-tray.
    this.mainWindow.on('session-end', () => this.markQuitting())

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

    blockForeignNavigation(this.captureWindow)
    this.captureWindow.on('ready-to-show', () => {
      this.captureWindow?.show()
      this.captureWindow?.focus()
    })

    // Scope both handlers to THIS window: a closing capture window's late
    // 'closed'/'blur' must not null or close a newer one opened right after
    // (the newer one would become unclosable and a third could stack up).
    // Typed text survives the blur-close as a renderer-side draft.
    const win = this.captureWindow
    win.on('blur', () => {
      if (!win.isDestroyed()) win.close()
    })

    win.on('closed', () => {
      if (this.captureWindow === win) this.captureWindow = null
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

    blockForeignNavigation(win)
    win.on('ready-to-show', () => win.show())
    // The note's path can change while the window is open (rename/move →
    // `remapStickies`), so handlers look up the window's current key.
    const saveGeometry = () => {
      const current = this.stickyPathOf(win)
      if (current !== null) this.debouncedSaveGeometry(current, win)
    }
    win.on('move', saveGeometry)
    win.on('resize', saveGeometry)
    win.on('closed', () => {
      const current = this.stickyPathOf(win)
      if (current === null) return
      this.stickies.delete(current)
      const timer = this.geometryTimers.get(current)
      if (timer) {
        clearTimeout(timer)
        this.geometryTimers.delete(current)
      }
      // A user-initiated close unpins the note; an app-quit close must NOT (so
      // the sticky restores next launch).
      if (!this.quitting) {
        this.settings
          ?.removeSticky(current)
          .catch((err) => console.error('removeSticky failed:', err))
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

  /** The note path an open sticky window is currently keyed by, or null. */
  private stickyPathOf(win: BrowserWindow): string | null {
    for (const [path, w] of this.stickies) if (w === win) return path
    return null
  }

  /**
   * A note or folder moved: re-keys every open sticky whose note moved, tells
   * its renderer the new path (sent before the caller's `vault:filesChanged`, so
   * the sticky never sees its note "disappear" and closes), and rewrites the
   * persisted stuck set. `map` returns the new path, or null when unaffected.
   */
  async remapStickies(map: (path: string) => string | null): Promise<void> {
    const moves: Array<{ from: string; to: string; win: BrowserWindow }> = []
    for (const [from, win] of this.stickies) {
      const to = map(from)
      if (to !== null && to !== from) moves.push({ from, to, win })
    }
    for (const { from } of moves) this.stickies.delete(from)
    for (const { from, to, win } of moves) {
      this.stickies.set(to, win)
      const timer = this.geometryTimers.get(from)
      if (timer) {
        // Re-arm under the new key so the pending geometry lands on the new entry.
        clearTimeout(timer)
        this.geometryTimers.delete(from)
        this.debouncedSaveGeometry(to, win)
      }
      if (!win.isDestroyed()) win.webContents.send('sticky:pathChanged', to)
    }
    if (!this.settings) return
    const saved = await this.settings.getStickies()
    let changed = false
    const next = saved.map((s) => {
      const to = map(s.path)
      if (to === null || to === s.path) return s
      changed = true
      return { ...s, path: to }
    })
    if (changed) await this.settings.setStickies(next)
  }

  private draftRequests = new Map<number, (draft: string | null) => void>()
  private nextDraftRequest = 1

  /**
   * Asks the sticky on `path` (if any) to stop saving and hand over its unsaved
   * draft. Null when there is no sticky, it is clean, or it doesn't answer in
   * time (a hung renderer can't save either; main refuses late plaintext writes).
   */
  takeStickyDraft(path: string, timeoutMs = 3_000): Promise<string | null> {
    const win = this.stickies.get(path)
    if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return Promise.resolve(null)
    const id = this.nextDraftRequest++
    return new Promise((resolve) => {
      const timer = setTimeout(() => finish(null), timeoutMs)
      const finish = (draft: string | null) => {
        clearTimeout(timer)
        this.draftRequests.delete(id)
        resolve(draft)
      }
      this.draftRequests.set(id, finish)
      win.webContents.send('sticky:flushRequest', id)
    })
  }

  /** The sticky's reply to `takeStickyDraft`. */
  resolveStickyDraft(id: number, draft: string | null): void {
    this.draftRequests.get(id)?.(draft)
  }

  /**
   * Closes a sticky immediately, skipping its renderer's save-on-close
   * (`beforeunload`); its 'closed' handler still unpins it.
   */
  destroySticky(path: string): void {
    const win = this.stickies.get(path)
    if (win && !win.isDestroyed()) win.destroy()
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
  /** Quit was cancelled at the unsaved-changes prompt: closing hides to tray again. */
  cancelQuit(): void {
    this.quitting = false
  }

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
