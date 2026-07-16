import { useCalendarStore } from '@renderer/stores/calendarStore'
import { useWorkspaceStore } from '@renderer/stores/workspaceStore'
import { Bell, X } from 'lucide-react'
import { useEffect } from 'react'

export function ReminderToast() {
  const { lastFired, dismissFired } = useCalendarStore()
  const openTab = useWorkspaceStore((s) => s.openTab)

  useEffect(() => {
    if (!lastFired) return
    const timer = setTimeout(dismissFired, 8000)
    return () => clearTimeout(timer)
  }, [lastFired, dismissFired])

  if (!lastFired) return null

  function handleClick() {
    if (lastFired?.notePath) {
      openTab(lastFired.notePath)
    }
    dismissFired()
  }

  return (
    <div className="fixed right-4 top-14 z-[60] animate-in slide-in-from-right">
      <button
        type="button"
        onClick={handleClick}
        className="flex w-72 cursor-pointer items-start gap-3 rounded-lg border border-slate-700/80 bg-slate-800 p-3 text-left shadow-xl light:border-slate-300 light:bg-white"
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/20">
          <Bell size={16} className="text-amber-400" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-slate-100 light:text-slate-900">
            Hatırlatıcı
          </p>
          <p className="mt-0.5 truncate text-xs text-slate-400 light:text-slate-600">
            {lastFired.title}
          </p>
          {lastFired.notePath && (
            <p className="mt-1 truncate text-[10px] text-accent-400">
              {lastFired.notePath}
            </p>
          )}
        </div>
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation()
            dismissFired()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.stopPropagation()
              dismissFired()
            }
          }}
          className="rounded p-0.5 text-slate-500 hover:text-slate-300"
        >
          <X size={12} />
        </span>
      </button>
    </div>
  )
}
