import { useT } from '@renderer/i18n'
import { useTagsStore } from '@renderer/stores/tagsStore'
import { osTrash, useTrashStore } from '@renderer/stores/trashStore'
import { AlertTriangle, Trash2, X } from 'lucide-react'
import { useEffect } from 'react'

/**
 * Bottom toast shown right after a delete: an Undo offer when the note/folder
 * was trashed, or an error when the delete failed (nothing was deleted).
 */
export function TrashToast() {
  const t = useT()
  const lastTrashed = useTrashStore((s) => s.lastTrashed)
  const deleteFailure = useTrashStore((s) => s.deleteFailure)
  const dismissToast = useTrashStore((s) => s.dismissToast)
  const restore = useTrashStore((s) => s.restore)

  useEffect(() => {
    if (!lastTrashed && !deleteFailure) return
    const timer = setTimeout(dismissToast, 8000)
    return () => clearTimeout(timer)
  }, [lastTrashed, deleteFailure, dismissToast])

  if (!lastTrashed && !deleteFailure) return null

  const undo = async () => {
    if (!lastTrashed) return
    const path = await restore(lastTrashed.id)
    if (path !== null) void useTagsStore.getState().loadTags()
  }

  let message: string
  if (lastTrashed) {
    message = lastTrashed.osTrashed
      ? t('sidebar.trashToast.movedToOsTrash', { name: lastTrashed.name, osTrashTo: osTrash('to') })
      : t('sidebar.trashToast.movedToTrash', { name: lastTrashed.name })
  } else {
    message = t('sidebar.trashToast.deleteFailed', {
      name: String(deleteFailure?.name),
      error: String(deleteFailure?.error),
    })
  }

  return (
    <div className="fixed bottom-4 left-1/2 z-[60] -translate-x-1/2" role="status">
      <div className="flex max-w-[90vw] items-center gap-3 rounded-lg border border-slate-700/80 bg-slate-800 py-2 pr-2 pl-3 shadow-xl light:border-slate-300 light:bg-white">
        {lastTrashed ? (
          <Trash2 size={14} className="shrink-0 text-slate-400" aria-hidden="true" />
        ) : (
          <AlertTriangle size={14} className="shrink-0 text-red-400" aria-hidden="true" />
        )}
        <p className="min-w-0 truncate text-xs text-slate-200 light:text-slate-800">{message}</p>
        {lastTrashed && (
          <button
            type="button"
            onClick={() => void undo()}
            className="shrink-0 rounded px-2 py-0.5 text-[11px] font-medium text-accent-400 transition hover:bg-accent-500/20"
          >
            {t('sidebar.trashToast.undo')}
          </button>
        )}
        <button
          type="button"
          onClick={dismissToast}
          title={t('sidebar.trashToast.dismiss')}
          className="shrink-0 rounded p-0.5 text-slate-500 hover:text-slate-300 light:hover:text-slate-700"
        >
          <X size={12} aria-hidden="true" />
          <span className="sr-only">{t('sidebar.trashToast.dismiss')}</span>
        </button>
      </div>
    </div>
  )
}
