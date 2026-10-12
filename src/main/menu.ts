import { app, Menu, type MenuItemConstructorOptions } from 'electron'
import { tm } from './i18n'

/**
 * Installs Slate's application menu, replacing Electron's default one.
 *
 * The default menu carries `undo`/`redo` roles (Ctrl/Cmd+Z, Ctrl+Y). Those call
 * `webContents.undo()`, i.e. Chromium's *native* contenteditable undo, which
 * rewrites CodeMirror's DOM behind its back (e.g. replaying typing from another
 * tab's document after `view.setState`). CodeMirror then reads the mangled DOM
 * back and hidden formatting markers surface as raw text. Undo/redo are owned
 * entirely by the editor (see `src/renderer/editor/undoGuard.ts`), so they are
 * deliberately absent here.
 *
 * Cut/copy/paste/select-all stay as roles so the macOS clipboard shortcuts keep
 * working (on macOS key equivalents only exist through the menu). On Windows and
 * Linux the main window is frameless with `autoHideMenuBar`, so the bar is never
 * visible; the accelerators only fire for keys the renderer didn't handle.
 *
 * Reload/devtools are kept in development only — production builds should not
 * reload (and drop unsaved drafts) on a stray Ctrl+R.
 *
 * Labels come from the main-process dictionary (`./i18n`); call this again after
 * a language switch to rebuild the menu in the new language.
 */
export function installAppMenu(): void {
  const isMac = process.platform === 'darwin'
  const isDev = !app.isPackaged

  const template: MenuItemConstructorOptions[] = []

  if (isMac) {
    template.push({
      label: app.name,
      submenu: [
        { role: 'about', label: tm('menu.about') },
        { type: 'separator' },
        { role: 'hide', label: tm('menu.hide') },
        { role: 'hideOthers', label: tm('menu.hideOthers') },
        { role: 'unhide', label: tm('menu.unhide') },
        { type: 'separator' },
        { role: 'quit', label: tm('menu.quit') },
      ],
    })
  }

  template.push({
    label: tm('menu.edit'),
    submenu: [
      { role: 'cut', label: tm('menu.cut') },
      { role: 'copy', label: tm('menu.copy') },
      { role: 'paste', label: tm('menu.paste') },
      { type: 'separator' },
      { role: 'selectAll', label: tm('menu.selectAll') },
    ],
  })

  if (isDev) {
    template.push({
      label: tm('menu.view'),
      submenu: [
        { role: 'reload', label: tm('menu.reload') },
        { role: 'toggleDevTools', label: tm('menu.toggleDevTools') },
      ],
    })
  }

  if (isMac) {
    template.push({
      label: tm('menu.window'),
      submenu: [
        { role: 'minimize', label: tm('menu.minimize') },
        { role: 'zoom', label: tm('menu.zoom') },
        { type: 'separator' },
        { role: 'close', label: tm('menu.close') },
      ],
    })
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
