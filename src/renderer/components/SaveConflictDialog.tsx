import { ConfirmDialog } from '@renderer/components/ConfirmDialog'
import { useT } from '@renderer/i18n'
import { useDiskSyncStore } from '@renderer/stores/diskSyncStore'
import { baseName } from '@renderer/stores/externalPath'
import { useWorkspaceStore } from '@renderer/stores/workspaceStore'
import { useEffect } from 'react'

/**
 * The save-conflict prompt (a tab's file changed on disk since Slate loaded or
 * saved it) plus the window-focus check that silently reloads clean tabs whose
 * file changed elsewhere. Mounted once in the main window.
 */
export function SaveConflictDialog() {
  const conflict = useDiskSyncStore((s) => s.conflict)
  const overwrite = useDiskSyncStore((s) => s.overwrite)
  const reload = useDiskSyncStore((s) => s.reload)
  const cancel = useDiskSyncStore((s) => s.cancel)
  const t = useT()

  useEffect(() => {
    const onFocus = () => void useDiskSyncStore.getState().checkOpenTabs()
    window.addEventListener('focus', onFocus)
    // Forget deleted-on-disk marks of tabs that were closed.
    const offTabs = useWorkspaceStore.subscribe((s) => {
      const { missing } = useDiskSyncStore.getState()
      if (missing.length === 0) return
      const open = new Set(s.tabs.map((t) => t.path))
      const kept = missing.filter((p) => open.has(p))
      if (kept.length !== missing.length) useDiskSyncStore.setState({ missing: kept })
    })
    return () => {
      window.removeEventListener('focus', onFocus)
      offTabs()
    }
  }, [])

  return (
    <ConfirmDialog
      open={conflict !== null}
      title={t('app.saveConflict.title')}
      message={t('app.saveConflict.message', { name: conflict ? baseName(conflict.path) : '' })}
      confirmLabel={t('app.saveConflict.overwrite')}
      confirmTone="danger"
      onConfirm={() => void overwrite()}
      onDiscard={() => void reload()}
      discardLabel={t('app.saveConflict.reload')}
      // Enter must not destroy either version: it answers Cancel (keep editing).
      initialFocus="cancel"
      onCancel={cancel}
    />
  )
}
