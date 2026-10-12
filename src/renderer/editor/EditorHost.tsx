import { EditorState } from '@codemirror/state'
import { HighlightToolbar } from '@renderer/editor/HighlightToolbar'
import { createTabState, getEditorTheme, themeCompartment } from '@renderer/editor/setup'
import { onDiskContent } from '@renderer/stores/diskSyncStore'
import { isExternalTabPath } from '@renderer/stores/externalPath'
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
  // Locked placeholders hold no text: their cached editor state is dropped.
  const openPaths = useWorkspaceStore((s) =>
    s.tabs
      .filter((t) => !t.locked)
      .map((t) => t.path)
      .join('\n'),
  )
  const activeLocked = useWorkspaceStore(
    (s) => s.tabs.find((t) => t.path === s.activeTabPath)?.locked === true,
  )
  const resolved = useThemeStore((s) => s.resolved)
  const colorThemeId = useThemeStore((s) => s.colorThemeId)
  const fontSize = useThemeStore((s) => s.fontSize)

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
    if (activeLocked) {
      // Locked placeholder (ContentPane hides the editor): show nothing, keep
      // no decrypted state around, and don't cache this empty one.
      statesRef.current.delete(activeTabPath)
      view.setState(EditorState.create({ doc: '' }))
      return
    }

    let state = statesRef.current.get(activeTabPath)
    if (state === undefined) {
      const tab = useWorkspaceStore.getState().tabs.find((t) => t.path === activeTabPath)
      state = createTabState(
        {
          path: activeTabPath,
          external: isExternalTabPath(activeTabPath),
          doc: tab?.draft ?? '',
          onDocChange: (text) => useWorkspaceStore.getState().setTabDraft(activeTabPath, text),
          onSave: () => void useWorkspaceStore.getState().saveActiveTab(),
        },
        resolved,
        fontSize,
      )
      statesRef.current.set(activeTabPath, state)
    }
    view.setState(state)
    view.focus()

    return () => {
      const v = viewRef.current
      if (v !== null) statesRef.current.set(activeTabPath, v.state)
    }
  }, [activeTabPath, activeLocked, resolved])

  // Reconfigure theme on all cached tab states when theme, color theme, or font size changes.
  useEffect(() => {
    const view = viewRef.current
    if (view === null) return
    const colorTheme = useThemeStore.getState().getActiveColorTheme()
    const theme = getEditorTheme(resolved, colorTheme, fontSize)
    view.dispatch({ effects: themeCompartment.reconfigure(theme) })
    for (const [path, state] of statesRef.current) {
      if (path === activeTabPath) continue
      const updated = state.update({ effects: themeCompartment.reconfigure(theme) }).state
      statesRef.current.set(path, updated)
    }
  }, [resolved, activeTabPath, colorThemeId, fontSize])

  useEffect(() => {
    const open = new Set(openPaths === '' ? [] : openPaths.split('\n'))
    for (const path of statesRef.current.keys()) {
      if (!open.has(path)) statesRef.current.delete(path)
    }
  }, [openPaths])

  // Near-live sync (Epic 11 Phase 03): when a note is saved by another window,
  // reload its content into the open tab — the live view if it's active, else the
  // cached state. `reloadTab` returns null when the tab is dirty or unchanged.
  // The same replacement serves disk changes made by other programs (diskSyncStore:
  // focus reload, conflict → Reload).
  useEffect(() => {
    const apply = (path: string, content: string) => {
      const view = viewRef.current
      if (path === useWorkspaceStore.getState().activeTabPath && view !== null) {
        if (view.state.doc.toString() === content) return
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: content } })
      } else {
        const cached = statesRef.current.get(path)
        if (cached !== undefined) {
          statesRef.current.set(
            path,
            cached.update({ changes: { from: 0, to: cached.doc.length, insert: content } }).state,
          )
        }
      }
    }
    const offDisk = onDiskContent(apply)
    const offNote = window.api.window.onNoteChanged((path) => {
      void useWorkspaceStore
        .getState()
        .reloadTab(path)
        .then((content) => {
          if (content !== null) apply(path, content)
        })
    })
    return () => {
      offDisk()
      offNote()
    }
  }, [])

  return (
    <div className="relative h-full overflow-hidden">
      <div ref={hostRef} className="h-full" />
      <HighlightToolbar view={editorView} />
    </div>
  )
}
