import { join } from 'node:path'
import { app } from 'electron'

/**
 * Absolute path to an app icon file on the real filesystem (not inside the asar).
 * Packaged: copied next to app.asar via electron-builder `extraResources`, because
 * Windows toast notifications and the tray need a real file path.
 * Dev: `out/main` → `<repo>/resources`.
 */
export function getAppIconPath(ext: 'png' | 'ico' = 'png'): string {
  const file = `icon.${ext}`
  if (app.isPackaged) return join(process.resourcesPath, file)
  return join(__dirname, '../../resources', file)
}
