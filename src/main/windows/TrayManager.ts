import { Menu, nativeImage, Tray } from 'electron'
import { getAppIconPath } from '../appIcon'
import { tm } from '../i18n'

type TrayActions = {
  /** Show and focus the main window, recreating it if it was destroyed. */
  open: () => void
  /** Really quit the app (not just hide). */
  quit: () => void
}

/**
 * System-tray entry point: lets Slate keep running (and firing reminders) with
 * the main window hidden. Owns the single Tray instance.
 */
export class TrayManager {
  private tray: Tray | null = null
  private actions: TrayActions | null = null

  create(actions: TrayActions): void {
    if (this.tray) return
    const isWin = process.platform === 'win32'
    let image = nativeImage.createFromPath(getAppIconPath(isWin ? 'ico' : 'png'))
    if (image.isEmpty()) image = nativeImage.createFromPath(getAppIconPath('png'))
    // macOS menu-bar icons are ~18pt tall; Windows picks the right .ico frame.
    if (process.platform === 'darwin' && !image.isEmpty()) image = image.resize({ height: 18 })

    this.tray = new Tray(image)
    this.actions = actions
    this.refresh()
    // On macOS a click opens the context menu; on Windows/Linux it opens the app.
    if (process.platform !== 'darwin') {
      this.tray.on('click', () => actions.open())
      this.tray.on('double-click', () => actions.open())
    }
  }

  /** (Re)builds the tooltip and context menu in the active language. */
  refresh(): void {
    const tray = this.tray
    const actions = this.actions
    if (!tray || !actions) return
    tray.setToolTip(tm('tray.tooltip'))
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: tm('tray.open'), click: () => actions.open() },
        { type: 'separator' },
        { label: tm('tray.quit'), click: () => actions.quit() },
      ]),
    )
  }

  destroy(): void {
    this.tray?.destroy()
    this.tray = null
  }
}
