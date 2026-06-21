import { api } from '@renderer/api'
import { Logo } from '@renderer/components/Logo'
import { Minus, X } from 'lucide-react'
import { useEffect, useState } from 'react'

const isMac = api.platform === 'darwin'

/** Maximize glyph — a single square (shown when the window is restored). */
function MaximizeIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <rect x="0.5" y="0.5" width="9" height="9" rx="1" stroke="currentColor" />
    </svg>
  )
}

/** Restore glyph — two offset squares (shown when the window is maximized). */
function RestoreIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <rect x="2.5" y="0.5" width="7" height="7" rx="1" stroke="currentColor" />
      <rect x="0.5" y="2.5" width="7" height="7" rx="1" stroke="currentColor" fill="#0f172a" />
    </svg>
  )
}

/**
 * Custom window title bar for the frameless window (native chrome is disabled in
 * main via `frame: false`). The bar itself is the drag region; the controls and
 * logo opt out with `-webkit-app-region: no-drag` so they stay clickable.
 */
export function TitleBar() {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    api.window.isMaximized().then((r) => {
      if (r.ok) setMaximized(r.data)
    })
    return api.window.onMaximizeChange(setMaximized)
  }, [])

  return (
    <div className="flex h-9 shrink-0 items-center justify-between border-b border-slate-800 bg-slate-900 [-webkit-app-region:drag]" style={isMac ? { paddingLeft: '78px' } : { paddingLeft: '12px' }}>
      <div className="flex items-center gap-2 [-webkit-app-region:no-drag]">
        <Logo className="size-5 shrink-0 rounded-[5px]" />
        <span className="text-sm font-semibold tracking-tight text-slate-100">Slate</span>
      </div>

      {!isMac && (
        <div className="flex h-full items-stretch [-webkit-app-region:no-drag]">
          <button
            type="button"
            onClick={() => api.window.minimize()}
            title="Minimize"
            className="flex w-11 items-center justify-center text-slate-400 transition hover:bg-slate-800 hover:text-slate-100"
          >
            <Minus className="size-4" aria-hidden="true" />
            <span className="sr-only">Minimize</span>
          </button>
          <button
            type="button"
            onClick={() => api.window.toggleMaximize().then((r) => r.ok && setMaximized(r.data))}
            title={maximized ? 'Restore' : 'Maximize'}
            className="flex w-11 items-center justify-center text-slate-400 transition hover:bg-slate-800 hover:text-slate-100"
          >
            {maximized ? <RestoreIcon /> : <MaximizeIcon />}
            <span className="sr-only">{maximized ? 'Restore' : 'Maximize'}</span>
          </button>
          <button
            type="button"
            onClick={() => api.window.close()}
            title="Close"
            className="flex w-11 items-center justify-center text-slate-400 transition hover:bg-red-600 hover:text-white"
          >
            <X className="size-4" aria-hidden="true" />
            <span className="sr-only">Close</span>
          </button>
        </div>
      )}
    </div>
  )
}
