import { api } from '@renderer/api'
import { useWorkspaceStore } from '@renderer/stores/workspaceStore'
import type { NoteListItem } from '@shared/types'
import { useCallback, useEffect, useState } from 'react'

function formatDate(mtime: number): string {
  const d = new Date(mtime)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffDays === 0) {
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  }
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function NotesList() {
  const [notes, setNotes] = useState<NoteListItem[]>([])
  const activeTabPath = useWorkspaceStore((s) => s.activeTabPath)
  const openTab = useWorkspaceStore((s) => s.openTab)

  const load = useCallback(async () => {
    const result = await api.vault.listDetailed()
    if (result.ok) setNotes(result.data)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    return window.api.window.onFilesChanged(() => {
      load()
    })
  }, [load])

  if (notes.length === 0) {
    return <div className="px-3 py-4 text-xs text-slate-500">No notes yet.</div>
  }

  return (
    <div className="flex flex-col overflow-y-auto">
      {notes.map((note) => {
        const selected = activeTabPath === note.path
        return (
          <button
            key={note.path}
            type="button"
            onClick={() => openTab(note.path)}
            className={`flex flex-col gap-0.5 border-b px-3 py-2.5 text-left transition ${
              selected
                ? 'border-slate-700 bg-accent-500/10 dark:border-slate-700 light:border-slate-200 light:bg-accent-500/5'
                : 'border-slate-800 hover:bg-slate-800/60 dark:border-slate-800 light:border-slate-100 light:hover:bg-slate-50'
            }`}
          >
            <span
              className={`truncate text-sm font-medium ${
                selected
                  ? 'text-slate-50 light:text-slate-900'
                  : 'text-slate-200 light:text-slate-800'
              }`}
            >
              {note.title}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-500 light:text-slate-400">
                {formatDate(note.mtime)}
              </span>
              <span className="min-w-0 flex-1 truncate text-[11px] text-slate-500 light:text-slate-400">
                {note.snippet}
              </span>
            </div>
          </button>
        )
      })}
    </div>
  )
}
