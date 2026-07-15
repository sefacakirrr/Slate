import { api } from '@renderer/api'
import type { UpdateState } from '@shared/types'
import { useEffect, useState } from 'react'

export function UpdateBar() {
  const [update, setUpdate] = useState<UpdateState | null>(null)

  useEffect(() => {
    return api.update.onState((state: UpdateState) => setUpdate(state))
  }, [])

  if (!update) return null
  if (update.status === 'downloading') {
    const percent = update.percent ?? 0
    return (
      <div className="relative h-1 w-full overflow-hidden bg-slate-800 light:bg-slate-200">
        <div
          className="absolute inset-y-0 left-0 bg-accent-500 transition-[width] duration-300 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
    )
  }

  if (update.status === 'downloaded') {
    return (
      <div className="flex items-center justify-between bg-accent-500/10 px-3 py-1">
        <span className="text-[11px] text-accent-400">
          Update ready — restart to apply
        </span>
        <button
          type="button"
          onClick={() => api.update.install()}
          className="rounded px-2 py-0.5 text-[11px] font-medium text-accent-400 transition hover:bg-accent-500/20"
        >
          Restart Now
        </button>
      </div>
    )
  }

  return null
}
