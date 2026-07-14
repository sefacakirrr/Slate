import { createTabState, getEditorTheme, themeCompartment } from '@renderer/editor/setup'
import { useStickyStore } from '@renderer/stores/stickyStore'
import { useThemeStore } from '@renderer/stores/themeStore'
import { EditorView } from 'codemirror'
import { X } from 'lucide-react'
import { useEffect, useRef } from 'react'

/** `-webkit-app-region` isn't in React's CSSProperties; cast where we set it. */
const dragRegion = { WebkitAppRegion: 'drag' } as React.CSSProperties
const noDragRegion = { WebkitAppRegion: 'no-drag' } as React.CSSProperties

/**
 * A sticky-note window's view (Epic 11): a draggable frameless header + a close
 * button + the reused CodeMirror editor, backed by the single-note `stickyStore`.
 * Rendered for the `#/sticky/<path>` route.
 */
export function StickyNote({ notePath }: { notePath: string }) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)

  const status = useStickyStore((s) => s.status)
  const error = useStickyStore((s) => s.error)
  const init = useStickyStore((s) => s.init)
  const loadTheme = useThemeStore((s) => s.loadTheme)
  const resolved = useThemeStore((s) => s.resolved)

  const title =
    notePath
      .split('/')
      .pop()
      ?.replace(/\.\w+$/, '') ?? notePath

  // Load theme + note content on mount.
  useEffect(() => {
    void loadTheme()
    void init(notePath)
  }, [loadTheme, init, notePath])

  // Listen for theme changes from the main window.
  useEffect(() => {
    return window.api.window.onThemeChanged((theme) => {
      useThemeStore.getState().applyFromExternal(theme as 'dark' | 'light' | 'system')
    })
  }, [])

  // Best-effort save when the window loses focus (v1: last-write-wins).
  useEffect(() => {
    const save = () => void useStickyStore.getState().save()
    window.addEventListener('blur', save)
    window.addEventListener('beforeunload', save)
    return () => {
      window.removeEventListener('blur', save)
      window.removeEventListener('beforeunload', save)
    }
  }, [])

  // If the note is deleted, renamed, or locked from another window, close this
  // sticky — it can no longer edit a note that isn't there.
  useEffect(() => {
    return window.api.window.onFilesChanged(() => {
      void useStickyStore
        .getState()
        .stillValid()
        .then((valid) => {
          if (!valid) window.api.window.sticky.close(notePath)
        })
    })
  }, [notePath])

  // Near-live sync: when this note is saved by another window, reload the editor
  // (unless we have unsaved edits — reloadFromDisk returns null then).
  useEffect(() => {
    return window.api.window.onNoteChanged((changedPath) => {
      if (changedPath !== notePath) return
      void useStickyStore
        .getState()
        .reloadFromDisk()
        .then((content) => {
          const view = viewRef.current
          if (content === null || view === null) return
          view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: content } })
        })
    })
  }, [notePath])

  // Mount the CodeMirror editor once the note is loaded (mount-once).
  useEffect(() => {
    if (status !== 'ready' || hostRef.current === null || viewRef.current !== null) return
    const state = createTabState(
      {
        path: notePath,
        doc: useStickyStore.getState().draft,
        onDocChange: (text) => useStickyStore.getState().setDraft(text),
        onSave: () => void useStickyStore.getState().save(),
      },
      useThemeStore.getState().resolved,
    )
    const view = new EditorView({ state, parent: hostRef.current })
    viewRef.current = view
    view.focus()
    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [status, notePath])

  // Reconfigure the editor theme if the resolved theme changes after mount.
  useEffect(() => {
    const view = viewRef.current
    if (view === null) return
    view.dispatch({ effects: themeCompartment.reconfigure(getEditorTheme(resolved)) })
  }, [resolved])

  return (
    <div className="flex h-screen flex-col bg-slate-950 dark:bg-slate-950 light:bg-white">
      <div
        style={dragRegion}
        className="flex items-center justify-between border-b border-slate-800 px-3 py-1.5 dark:border-slate-800 light:border-slate-200"
      >
        <span className="truncate text-xs font-medium text-slate-400 light:text-slate-500">
          {title}
        </span>
        <button
          type="button"
          style={noDragRegion}
          onClick={async () => {
            // Flush unsaved edits before the window is destroyed — the async
            // blur/beforeunload saves can race the teardown and lose them.
            await useStickyStore.getState().save()
            window.api.window.sticky.close(notePath)
          }}
          className="rounded p-0.5 text-slate-500 transition hover:bg-slate-800 hover:text-slate-300 light:hover:bg-slate-100 light:hover:text-slate-700"
          title="Close sticky"
        >
          <X className="size-3.5" aria-hidden="true" />
          <span className="sr-only">Close sticky</span>
        </button>
      </div>

      {status === 'error' ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-4 text-center">
          <p className="text-xs text-slate-400 light:text-slate-500">
            {error === 'note-locked'
              ? 'This note is locked and can’t be shown here.'
              : 'This note can’t be shown.'}
          </p>
          <button
            type="button"
            onClick={() => window.api.window.sticky.close(notePath)}
            className="rounded-md bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-700 light:bg-slate-200 light:text-slate-700"
          >
            Close
          </button>
        </div>
      ) : (
        <div ref={hostRef} className="min-h-0 flex-1 overflow-hidden px-3 py-2.5" />
      )}
    </div>
  )
}
