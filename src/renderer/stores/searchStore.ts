import { api } from '@renderer/api'
import type { SearchResult } from '@shared/types'
import { create } from 'zustand'

type SearchState = {
  /** Whether the search panel overlay is visible. */
  open: boolean
  /** Current query text (controlled input). */
  query: string
  /** Latest ranked results for the most recent settled query. */
  results: SearchResult[]
  /** True while an IPC query is in flight. */
  loading: boolean
  /**
   * Monotonic id for the in-flight query. A response is applied only if its id
   * still matches — so a slow earlier query can't overwrite a newer one's
   * results (last-write-wins on the input).
   */
  seq: number
  /** When non-null, the panel is showing results for this tag (not FTS). */
  activeTag: string | null

  openPanel: () => void
  closePanel: () => void
  togglePanel: () => void
  /** Updates the query text. The panel debounces and calls {@link runQuery}. */
  setQuery: (query: string) => void
  /** Runs a query against the index; empty/whitespace clears results without IPC. */
  runQuery: (query: string) => Promise<void>
  /** Opens the panel with pre-populated tag results (bypasses FTS). */
  showTagResults: (tag: string, paths: string[]) => void
}

export const useSearchStore = create<SearchState>((set, get) => ({
  open: false,
  query: '',
  results: [],
  loading: false,
  seq: 0,
  activeTag: null,

  openPanel: () => set({ open: true }),
  closePanel: () => set({ open: false, query: '', results: [], loading: false, activeTag: null }),
  togglePanel: () => (get().open ? get().closePanel() : get().openPanel()),

  setQuery: (query) => set({ query, activeTag: null }),

  runQuery: async (query) => {
    const trimmed = query.trim()
    const id = get().seq + 1

    if (trimmed === '') {
      set({ seq: id, results: [], loading: false })
      return
    }

    set({ seq: id, loading: true })
    const result = await api.search.query(trimmed)

    if (get().seq !== id) return

    if (!result.ok) {
      console.error(`search query failed: ${result.error}`)
      set({ results: [], loading: false })
      return
    }
    set({ results: result.data, loading: false })
  },

  showTagResults: (tag, paths) => {
    const results: SearchResult[] = paths.map((path) => ({
      path,
      snippet: '',
      rank: 0,
    }))
    set({ open: true, query: `#${tag}`, results, loading: false, activeTag: tag })
  },
}))
