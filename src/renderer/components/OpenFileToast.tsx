import { useT } from '@renderer/i18n'
import { useOpenFilesStore } from '@renderer/stores/openFilesStore'
import { AlertTriangle, X } from 'lucide-react'
import { useEffect } from 'react'

/**
 * Bottom error toast for files that couldn't be opened from outside the app
 * (drag & drop, Open with): missing, too large, binary, or not UTF-8.
 */
export function OpenFileToast() {
  const failure = useOpenFilesStore((s) => s.failure)
  const dismiss = useOpenFilesStore((s) => s.dismiss)
  const t = useT()

  useEffect(() => {
    if (failure === null) return
    const timer = setTimeout(dismiss, 8000)
    return () => clearTimeout(timer)
  }, [failure, dismiss])

  if (failure === null) return null

  return (
    <div className="fixed bottom-16 left-1/2 z-[60] -translate-x-1/2" role="alert">
      <div className="flex max-w-[90vw] items-center gap-3 rounded-lg border border-slate-700/80 bg-slate-800 py-2 pr-2 pl-3 shadow-xl light:border-slate-300 light:bg-white">
        <AlertTriangle size={14} className="shrink-0 text-red-400" aria-hidden="true" />
        <p className="min-w-0 truncate text-xs text-slate-200 light:text-slate-800" title={failure}>
          {failure}
        </p>
        <button
          type="button"
          onClick={dismiss}
          title={t('app.toast.dismiss')}
          className="shrink-0 rounded p-0.5 text-slate-500 hover:text-slate-300 light:hover:text-slate-700"
        >
          <X size={12} aria-hidden="true" />
          <span className="sr-only">{t('app.toast.dismiss')}</span>
        </button>
      </div>
    </div>
  )
}
