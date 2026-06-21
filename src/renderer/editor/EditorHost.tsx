import type { EditorState } from '@codemirror/state'
import { HighlightToolbar } from '@renderer/editor/HighlightToolbar'
import { createTabState, getEditorTheme, themeCompartment } from '@renderer/editor/setup'
import { useThemeStore } from '@renderer/stores/themeStore'
import { useWorkspaceStore } from '@renderer/stores/workspaceStore'
import { EditorView } from 'codemirror'
import { useEffect, useRef, useState } from 'react'

export function EditorHost() {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const statesRef = useRef<Map<string, EditorState>>(new Map())
  const [editorView, setEditorView] = useState<EditorView | null>(null)

  const activeTabPath = useWorkspaceStore((s) => s.activeTabPath)
  const openPaths = useWorkspaceStore((s) => s.tabs.map((t) => t.path).join('\n'))
  const resolved = useThemeStore((s) => s.resolved)

  useEffect(() => {
    if (hostRef.current === null) return
    const view = new EditorView({ parent: hostRef.current })
    viewRef.current = view
    setEditorView(view)
    return () => {
      view.destroy()
      viewRef.current = null
      setEditorView(null)
      statesRef.current.clear()
    }
  }, [])

  useEffect(() => {
    const view = viewRef.current
    if (view === null || activeTabPath === null) return

    let state = statesRef.current.get(activeTabPath)
    if (state === undefined) {
      const tab = useWorkspaceStore.getState().tabs.find((t) => t.path === activeTabPath)
      state = createTabState(
        {
          path: activeTabPath,
          doc: tab?.draft ?? '',
          onDocChange: (text) => useWorkspaceStore.getState().setTabDraft(activeTabPath, text),
          onSave: () => void useWorkspaceStore.getState().saveActiveTab(),
        },
        resolved,
      )
      statesRef.current.set(activeTabPath, state)
    }
    view.setState(state)
    view.focus()

    return () => {
      const v = viewRef.current
      if (v !== null) statesRef.current.set(activeTabPath, v.state)
    }
  }, [activeTabPath, resolved])

  // Reconfigure theme on all cached tab states when theme changes.
  useEffect(() => {
    const view = viewRef.current
    if (view === null) return
    const theme = getEditorTheme(resolved)
    view.dispatch({ effects: themeCompartment.reconfigure(theme) })
    // Also update cached states so switching tabs picks up the new theme.
    for (const [path, state] of statesRef.current) {
      if (path === activeTabPath) continue
      const updated = state.update({ effects: themeCompartment.reconfigure(theme) }).state
      statesRef.current.set(path, updated)
    }
  }, [resolved, activeTabPath])

  useEffect(() => {
    const open = new Set(openPaths === '' ? [] : openPaths.split('\n'))
    for (const path of statesRef.current.keys()) {
      if (!open.has(path)) statesRef.current.delete(path)
    }
  }, [openPaths])

  return (
    <div className="relative h-full overflow-hidden">
      <div ref={hostRef} className="h-full" />
      <HighlightToolbar view={editorView} />
    </div>
  )
}
