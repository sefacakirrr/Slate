import { useWorkspaceStore } from '@renderer/stores/workspaceStore'
import { X } from 'lucide-react'

const NOTE_EXTENSIONS = ['.md', '.markdown', '.txt']

/** Tab label: the leaf filename without its note extension (and `.enc` for locked notes). */
function tabLabel(path: string): string {
  let name = path.split('/').pop() ?? path
  if (name.endsWith('.enc')) name = name.slice(0, -'.enc'.length)
  const lower = name.toLowerCase()
  const ext = NOTE_EXTENSIONS.find((e) => lower.endsWith(e))
  return ext ? name.slice(0, -ext.length) : name
}

/** Horizontal strip of open-note tabs above the editor. */
export function TabBar() {
  const tabs = useWorkspaceStore((s) => s.tabs)
  const activeTabPath = useWorkspaceStore((s) => s.activeTabPath)
  const activateTab = useWorkspaceStore((s) => s.activateTab)
  const closeTab = useWorkspaceStore((s) => s.closeTab)

  if (tabs.length === 0) return null

  return (
    <div className="flex min-w-0 items-stretch border-b border-slate-800 bg-slate-900 light:border-slate-200 light:bg-slate-50">
      {tabs.map((tab) => {
        const name = tabLabel(tab.path)
        const active = tab.path === activeTabPath
        return (
          <div
            key={tab.path}
            className={`group flex min-w-0 max-w-[200px] flex-1 items-center gap-1.5 border-r border-t-2 border-r-slate-800 py-1.5 pl-3 pr-1.5 text-xs transition light:border-r-slate-200 ${
              active
                ? 'border-t-accent-500 bg-slate-950 text-slate-100 light:bg-white light:text-slate-900'
                : 'border-t-transparent text-slate-400 hover:bg-slate-800/70 hover:text-slate-200 light:text-slate-500 light:hover:bg-white light:hover:text-slate-700'
            }`}
          >
            <button
              type="button"
              onClick={() => activateTab(tab.path)}
              className="flex min-w-0 flex-1 items-center gap-1.5"
              title={tab.path}
            >
              {tab.dirty && (
                <span className="size-1.5 shrink-0 rounded-full bg-amber-400" aria-hidden="true" />
              )}
              <span className="truncate">{name}</span>
            </button>
            <button
              type="button"
              onClick={() => closeTab(tab.path)}
              title="Close tab"
              className="shrink-0 rounded p-0.5 text-slate-500 transition hover:bg-slate-700 hover:text-slate-200 light:hover:bg-slate-100 light:hover:text-slate-600"
            >
              <X className="size-3" aria-hidden="true" />
              <span className="sr-only">Close {name}</span>
            </button>
          </div>
        )
      })}
    </div>
  )
}
