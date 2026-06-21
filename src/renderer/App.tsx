import { ConfirmDialog } from '@renderer/components/ConfirmDialog'
import { ContentPane } from '@renderer/components/ContentPane'
import { EmptyState } from '@renderer/components/EmptyState'
import { QuickCapture } from '@renderer/components/QuickCapture'
import { SearchPanel } from '@renderer/components/SearchPanel'
import { Sidebar } from '@renderer/components/Sidebar'
import { TitleBar } from '@renderer/components/TitleBar'
import { useSearchStore } from '@renderer/stores/searchStore'
import { useThemeStore } from '@renderer/stores/themeStore'
import { useVaultStore } from '@renderer/stores/vaultStore'
import { useWorkspaceStore } from '@renderer/stores/workspaceStore'
import { useEffect, useState } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'

export default function App() {
  if (window.location.hash === '#/capture') {
    return <QuickCapture />
  }
  return <MainApp />
}

function MainApp() {
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const loading = useVaultStore((s) => s.loading)
  const loadVaultPath = useVaultStore((s) => s.loadVaultPath)
  const loadFiles = useVaultStore((s) => s.loadFiles)
  const restoreWorkspace = useWorkspaceStore((s) => s.restoreWorkspace)
  const tabs = useWorkspaceStore((s) => s.tabs)
  const pendingClose = useWorkspaceStore((s) => s.pendingClose)
  const confirmCloseSave = useWorkspaceStore((s) => s.confirmCloseSave)
  const confirmCloseDiscard = useWorkspaceStore((s) => s.confirmCloseDiscard)
  const cancelClose = useWorkspaceStore((s) => s.cancelClose)
  const toggleSearch = useSearchStore((s) => s.togglePanel)
  const loadTheme = useThemeStore((s) => s.loadTheme)
  const [pendingQuit, setPendingQuit] = useState(false)

  useEffect(() => {
    loadVaultPath()
    loadTheme()
  }, [loadVaultPath, loadTheme])

  useEffect(() => {
    return window.api.window.onConfirmClose(() => {
      const hasDirty = useWorkspaceStore.getState().tabs.some((t) => t.dirty)
      if (hasDirty) {
        setPendingQuit(true)
      } else {
        window.api.window.forceClose()
      }
    })
  }, [])

  useHotkeys(
    'mod+shift+f',
    (e) => {
      e.preventDefault()
      toggleSearch()
    },
    { enableOnFormTags: true, enableOnContentEditable: true },
  )

  useHotkeys(
    'mod+t',
    (e) => {
      e.preventDefault()
      void useVaultStore
        .getState()
        .createNote()
        .then((path) => {
          if (path) void useWorkspaceStore.getState().openTab(path)
        })
    },
    { enableOnFormTags: true, enableOnContentEditable: true },
  )

  useHotkeys(
    'mod+w',
    (e) => {
      e.preventDefault()
      const active = useWorkspaceStore.getState().activeTabPath
      if (active) useWorkspaceStore.getState().closeTab(active)
    },
    { enableOnFormTags: true, enableOnContentEditable: true },
  )

  useEffect(() => {
    if (vaultPath !== null) loadFiles().then(restoreWorkspace)
  }, [vaultPath, loadFiles, restoreWorkspace])

  useEffect(() => {
    return window.api.window.onFilesChanged(() => {
      loadFiles()
    })
  }, [loadFiles])

  return (
    <div className="flex h-screen flex-col font-sans">
      <TitleBar />
      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">{renderBody()}</div>

      <SearchPanel />

      <ConfirmDialog
        open={pendingClose !== null}
        title="Unsaved changes"
        message={`"${pendingClose ?? ''}" has unsaved changes. Save before closing?`}
        confirmLabel="Save"
        confirmTone="primary"
        onConfirm={confirmCloseSave}
        onDiscard={confirmCloseDiscard}
        discardLabel="Discard"
        onCancel={cancelClose}
      />

      <ConfirmDialog
        open={pendingQuit}
        title="Quit with unsaved changes?"
        message={`You have ${tabs.filter((t) => t.dirty).length} unsaved note(s). Quit anyway?`}
        confirmLabel="Quit"
        confirmTone="danger"
        onConfirm={() => {
          setPendingQuit(false)
          window.api.window.forceClose()
        }}
        onCancel={() => setPendingQuit(false)}
      />
    </div>
  )

  function renderBody() {
    if (loading && vaultPath === null) {
      return <div className="h-full bg-slate-950 light:bg-white" />
    }

    if (vaultPath === null) {
      return <EmptyState />
    }

    return (
      <PanelGroup direction="horizontal" className="h-full">
        <Panel defaultSize={25} minSize={18} className="overflow-hidden">
          <Sidebar />
        </Panel>
        <PanelResizeHandle className="w-px bg-slate-800 transition-colors hover:bg-accent-500 data-[resize-handle-active]:bg-accent-500 light:bg-slate-200" />
        <Panel defaultSize={75} className="overflow-hidden">
          <ContentPane />
        </Panel>
      </PanelGroup>
    )
  }
}
