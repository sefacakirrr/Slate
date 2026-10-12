import { app } from 'electron'

/** Command-line flag passed by the login item: start with no visible window. */
export const HIDDEN_FLAG = '--hidden'

/**
 * Registers/unregisters Slate as an OS login item. Packaged builds only: in dev
 * `process.execPath` is the bare electron.exe, which would register the wrong app.
 */
export function applyLaunchAtLogin(enabled: boolean): void {
  if (!app.isPackaged) return
  try {
    app.setLoginItemSettings({ openAtLogin: enabled, args: [HIDDEN_FLAG] })
  } catch (err) {
    console.error('setLoginItemSettings failed:', err)
  }
}

/** True when this process was started by the login item (no window wanted). */
export function wasLaunchedHidden(): boolean {
  if (process.argv.includes(HIDDEN_FLAG)) return true
  if (process.platform === 'darwin') {
    try {
      return app.getLoginItemSettings().wasOpenedAtLogin === true
    } catch {
      return false
    }
  }
  return false
}
