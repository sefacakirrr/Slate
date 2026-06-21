import { join } from 'node:path'
import { BrowserWindow } from 'electron'

const isMac = process.platform === 'darwin'

export class WindowManager {
  private mainWindow: BrowserWindow | null = null
  private captureWindow: BrowserWindow | null = null
  private forceClosing = false

  getMainWindow(): BrowserWindow | null {
    return this.mainWindow
  }

  createMainWindow(): BrowserWindow {
    this.mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      show: false,
      frame: isMac,
      titleBarStyle: isMac ? 'hiddenInset' : undefined,
      trafficLightPosition: isMac ? { x: 12, y: 12 } : undefined,
      backgroundColor: '#020617',
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
      backgroundColor: isMac ? undefined : '#020617',
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
}
