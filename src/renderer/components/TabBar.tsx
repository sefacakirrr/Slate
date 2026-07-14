import { useWorkspaceStore } from '@renderer/stores/workspaceStore'
import { X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

const NOTE_EXTENSIONS = ['.md', '.markdown', '.txt']

function tabLabel(path: string): string {
  let name = path.split('/').pop() ?? path
  if (name.endsWith('.enc')) name = name.slice(0, -'.enc'.length)
  const lower = name.toLowerCase()
  const ext = NOTE_EXTENSIONS.find((e) => lower.endsWith(e))
  return ext ? name.slice(0, -ext.length) : name
}

type MenuPos = { x: number; y: number; path: string } | null

export function TabBar() {
  const tabs = useWorkspaceStore((s) => s.tabs)
  const activeTabPath = useWorkspaceStore((s) => s.activeTabPath)
  const activateTab = useWorkspaceStore((s) => s.activateTab)
  const closeTab = useWorkspaceStore((s) => s.closeTab)
  const closeOtherTabs = useWorkspaceStore((s) => s.closeOtherTabs)
  const closeTabsToRight = useWorkspaceStore((s) => s.closeTabsToRight)
  const closeAllTabs = useWorkspaceStore((s) => s.closeAllTabs)

  const [menu, setMenu] = useState<MenuPos>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const handleContextMenu = useCallback((e: React.MouseEvent, path: string) => {
    e.preventDefault()
    setMenu({ x: e.clientX, y: e.clientY, path })
  }, [])

  useEffect(() => {
    if (!menu) return
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(null)
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(null)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [menu])

  if (tabs.length === 0) return null

  const menuTabIdx = menu ? tabs.findIndex((t) => t.path === menu.path) : -1
  const hasTabsToRight = menuTabIdx >= 0 && menuTabIdx < tabs.length - 1

  return (
    <div className="relative flex min-w-0 items-stretch border-b border-slate-800 bg-slate-900 light:border-slate-200 light:bg-slate-50">
      {tabs.map((tab) => {
        const name = tabLabel(tab.path)
        const active = tab.path === activeTabPath
        return (
          <div
            key={tab.path}
            onContextMenu={(e) => handleContextMenu(e, tab.path)}
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

      {menu && (
        <div
          ref={menuRef}
          className="fixed z-50 min-w-[180px] rounded-md border border-slate-700 bg-slate-800 py-1 text-xs shadow-xl light:border-slate-200 light:bg-white"
          style={{ left: menu.x, top: menu.y }}
        >
          <ContextMenuItem
            label="Close"
            onClick={() => { closeTab(menu.path); setMenu(null) }}
          />
          <ContextMenuItem
            label="Close Others"
            onClick={() => { closeOtherTabs(menu.path); setMenu(null) }}
            disabled={tabs.length <= 1}
          />
          <ContextMenuItem
            label="Close to the Right"
            onClick={() => { closeTabsToRight(menu.path); setMenu(null) }}
            disabled={!hasTabsToRight}
          />
          <div className="my-1 border-t border-slate-700 light:border-slate-200" />
          <ContextMenuItem
            label="Close All"
            onClick={() => { closeAllTabs(); setMenu(null) }}
          />
        </div>
      )}
    </div>
  )
}

function ContextMenuItem({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center px-3 py-1.5 text-left text-slate-200 transition hover:bg-slate-700 disabled:cursor-default disabled:text-slate-500 disabled:hover:bg-transparent light:text-slate-700 light:hover:bg-slate-100 light:disabled:text-slate-400"
    >
      {label}
    </button>
  )
}
