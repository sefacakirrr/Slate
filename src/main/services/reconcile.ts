import type { IndexService } from './IndexService'
import type { VaultService } from './VaultService'

/**
 * Self-healing launch reconciliation: brings the FTS index back in line with the
 * vault on disk, which is the single source of truth. The index can drift while
 * the app is closed (files edited, added, or removed externally), so on startup
 * we diff disk against the index by modification time and repair the difference.
 *
 * - A path on disk that is unindexed, or whose file is newer than the indexed
 *   copy, is (re)indexed with its current content.
 * - A path in the index that no longer exists on disk is dropped.
 * - Unchanged files (same-or-older mtime) are skipped — their content is never
 *   read, so steady-state reconciliation costs one directory stat pass.
 *
 * Pure of Electron: it is handed a {@link VaultService} (disk reads) and an
 * {@link IndexService} (the index), so it unit-tests against a temp vault + db.
 */
export async function reconcileIndex(vault: VaultService, index: IndexService): Promise<void> {
  const disk = await vault.listNotesWithMtime()
  const stale = new Map(index.getIndexed().map((n) => [n.path, n.mtime]))

  for (const { path, mtime } of disk) {
    const indexedMtime = stale.get(path)
    if (indexedMtime === undefined || mtime > indexedMtime) {
      index.indexNote(path, await vault.readNote(path), mtime)
    }
    // Seen on disk → not an orphan, regardless of whether we re-indexed it.
    stale.delete(path)
  }

  // Whatever is left was indexed but is gone from disk.
  for (const path of stale.keys()) index.removeNote(path)
}
