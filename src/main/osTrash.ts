import { shell } from 'electron'

/** Trash items older than this are purged on launch. */
export const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000

/**
 * Sends a path to the OS recycle bin (Windows Recycle Bin / macOS Trash).
 * Throws when the platform trash is unavailable or refuses the path — the
 * caller decides the fallback; this never deletes anything permanently.
 */
export async function sendToOsTrash(absPath: string): Promise<void> {
  await shell.trashItem(absPath)
}
