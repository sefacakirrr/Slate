import { useT } from '@renderer/i18n'
import { useSearchStore } from '@renderer/stores/searchStore'
import { useWorkspaceStore } from '@renderer/stores/workspaceStore'
import type { SearchResult } from '@shared/types'
import { Search } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { splitSnippet } from './searchHighlight'

/** Debounce window (ms) — typing waits this long before an IPC query fires. */
const DEBOUNCE_MS = 180

/** Filename without its extension, derived from a vault-relative path. */
function titleOf(path: string): string {
  const name = path.split('/').pop() ?? path
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(0, dot) : name
}

/**
 * `Ctrl+Shift+F` full-text search overlay. Debounced query → `api.search.query`;
 * ranked results with highlighted snippets; click (or Enter on the first hit)
 * opens the note via the E3 workspace. Esc or a backdrop click dismisses.
 */
export function SearchPanel() {
  const t = useT()
  const open = useSearchStore((s) => s.open)
  const query = useSearchStore((s) => s.query)
  const results = useSearchStore((s) => s.results)
  const loading = useSearchStore((s) => s.loading)
  const activeTag = useSearchStore((s) => s.activeTag)
  const setQuery = useSearchStore((s) => s.setQuery)
  const runQuery = useSearchStore((s) => s.runQuery)
  const closePanel = useSearchStore((s) => s.closePanel)
  const openTab = useWorkspaceStore((s) => s.openTab)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus the input each time the panel opens.
  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  // Debounce: run the query DEBOUNCE_MS after the last keystroke. Re-runs when
  // the panel opens (query '' clears results). The timer is cleared on each
  // change so fast typing fires at most one IPC. Tag results (`#tag` query set
  // by a tag chip) are already final: a full-text run would replace them.
  useEffect(() => {
    if (!open || activeTag !== null) return
    const timer = setTimeout(() => void runQuery(query), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [open, query, activeTag, runQuery])

  if (!open) return null

  const openResult = (path: string) => {
    void openTab(path)
    closePanel()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      closePanel()
    } else if (e.key === 'Enter' && results.length > 0) {
      e.preventDefault()
      openResult(results[0].path)
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-center pt-[12vh]">
      <button
        type="button"
        aria-label={t('sidebar.search.close')}
        onClick={closePanel}
        className="absolute inset-0 size-full cursor-default bg-slate-950/70 backdrop-blur-sm"
      />
      <div
        className="relative mx-4 flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-slate-700/80 bg-slate-800 shadow-2xl shadow-black/50"
        role="dialog"
        aria-modal="true"
        aria-label={t('sidebar.search.label')}
      >
        <div className="flex items-center gap-2 border-b border-slate-700/70 px-3.5">
          <Search className="size-4 shrink-0 text-slate-500" aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t('sidebar.search.placeholder')}
            aria-label={t('sidebar.search.label')}
            className="min-w-0 flex-1 bg-transparent py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <Results
            query={query}
            loading={loading}
            results={results}
            onOpen={openResult}
            activeTag={activeTag}
          />
        </div>
      </div>
    </div>
  )
}

function Results({
  query,
  loading,
  results,
  onOpen,
  activeTag,
}: {
  query: string
  loading: boolean
  results: SearchResult[]
  onOpen: (path: string) => void
  activeTag: string | null
}) {
  const t = useT()
  if (query.trim() === '' && activeTag === null) {
    return <Hint>{t('sidebar.search.hint')}</Hint>
  }
  if (results.length === 0) {
    return <Hint>{loading ? t('sidebar.search.searching') : t('sidebar.search.noResults')}</Hint>
  }
  return (
    <ul className="py-1">
      {results.map((r) => (
        <li key={r.path}>
          <button
            type="button"
            onClick={() => onOpen(r.path)}
            className="flex w-full flex-col gap-0.5 px-3.5 py-2 text-left transition hover:bg-slate-700/60"
          >
            <span className="flex items-baseline gap-2">
              <span className="truncate text-sm font-medium text-slate-100">{titleOf(r.path)}</span>
              <span className="truncate text-xs text-slate-500">{r.path}</span>
            </span>
            {r.snippet && (
              <span className="line-clamp-2 text-xs text-slate-400">
                {splitSnippet(r.snippet).map((seg, i) =>
                  seg.highlight ? (
                    // biome-ignore lint/suspicious/noArrayIndexKey: segments are positional and static per render
                    <mark key={i} className="rounded-sm bg-accent-500/30 px-0.5 text-accent-200">
                      {seg.text}
                    </mark>
                  ) : (
                    // biome-ignore lint/suspicious/noArrayIndexKey: segments are positional and static per render
                    <span key={i}>{seg.text}</span>
                  ),
                )}
              </span>
            )}
          </button>
        </li>
      ))}
    </ul>
  )
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="px-3.5 py-6 text-center text-xs text-slate-500">{children}</p>
}
