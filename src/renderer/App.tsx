import { BackgroundLayer } from '@renderer/components/BackgroundLayer'
import { ConfirmDialog } from '@renderer/components/ConfirmDialog'
import { ContentPane } from '@renderer/components/ContentPane'
import { EmptyState } from '@renderer/components/EmptyState'
import { ImportWizard } from '@renderer/components/ImportWizard'
import { NoticeToast } from '@renderer/components/NoticeToast'
import { OpenFileToast } from '@renderer/components/OpenFileToast'
import { PatchNotesModal } from '@renderer/components/PatchNotes'
import { QuickCapture } from '@renderer/components/QuickCapture'
import { ReminderModal } from '@renderer/components/ReminderModal'
import { ReminderToast } from '@renderer/components/ReminderToast'
import { SaveConflictDialog } from '@renderer/components/SaveConflictDialog'
import { SearchPanel } from '@renderer/components/SearchPanel'
import { Sidebar } from '@renderer/components/Sidebar'
import { StickyNote } from '@renderer/components/StickyNote'
import { TitleBar } from '@renderer/components/TitleBar'
import { TrashToast } from '@renderer/components/TrashToast'
import { UnlockDialog } from '@renderer/components/UnlockDialog'
import { UpdateBar } from '@renderer/components/UpdateBar'
import { useT } from '@renderer/i18n'
import { useCalendarStore } from '@renderer/stores/calendarStore'
import { useEncryptionStore } from '@renderer/stores/encryptionStore'
import { useOpenFilesStore } from '@renderer/stores/openFilesStore'
import { useSearchStore } from '@renderer/stores/searchStore'
import { useThemeStore } from '@renderer/stores/themeStore'
import { useVaultStore } from '@renderer/stores/vaultStore'
import { useWorkspaceStore } from '@renderer/stores/workspaceStore'
import { useEffect, useState } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'

export default function App() {
  const hash = window.location.hash
  if (hash === '#/capture') {
    return <QuickCapture />
  }
  if (hash.startsWith('#/sticky/')) {
    const notePath = decodeURIComponent(hash.slice('#/sticky/'.length))
    return <StickyNote notePath={notePath} />
  }
  return <MainApp />
}

function MainApp() {
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const loading = useVaultStore((s) => s.loading)
  const loadVaultPath = useVaultStore((s) => s.loadVaultPath)
  const loadFiles = useVaultStore((s) => s.loadFiles)
  const offerFirstRunImport = useVaultStore((s) => s.offerFirstRunImport)
  const dismissFirstRunImport = useVaultStore((s) => s.dismissFirstRunImport)
  const restoreWorkspace = useWorkspaceStore((s) => s.restoreWorkspace)
  const loadAutoSave = useWorkspaceStore((s) => s.loadAutoSave)
  const tabs = useWorkspaceStore((s) => s.tabs)
  const pendingClose = useWorkspaceStore((s) => s.pendingClose)
  const confirmCloseSave = useWorkspaceStore((s) => s.confirmCloseSave)
  const confirmCloseDiscard = useWorkspaceStore((s) => s.confirmCloseDiscard)
  const cancelClose = useWorkspaceStore((s) => s.cancelClose)
  const toggleSearch = useSearchStore((s) => s.togglePanel)
  const loadTheme = useThemeStore((s) => s.loadTheme)
  const initEncryption = useEncryptionStore((s) => s.init)
  const t = useT()
  const [pendingQuit, setPendingQuit] = useState(false)
  // True once the persisted tabs are restored; OS open requests wait for it so
  // the restore can't reorder or re-activate over a freshly opened file.
  const [workspaceReady, setWorkspaceReady] = useState(false)

  useEffect(() => {
    loadVaultPath()
    loadTheme()
    initEncryption()
    void loadAutoSave()
  }, [loadVaultPath, loadTheme, initEncryption, loadAutoSave])

  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      if (e.deltaY < 0) useThemeStore.getState().increaseFontSize()
      else useThemeStore.getState().decreaseFontSize()
    }
    window.addEventListener('wheel', handleWheel, { passive: false })
    return () => window.removeEventListener('wheel', handleWheel)
  }, [])

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

  // Font size: Ctrl/Cmd with = + - (main row or numpad, any layout). Matched on
  // the produced character, not via useHotkeys: its parser maps '-' to 'slash',
  // so 'mod+-' never fired, and '=' needs Shift on some layouts (Turkish Q).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return
      if (e.key === '=' || e.key === '+') {
        e.preventDefault()
        useThemeStore.getState().increaseFontSize()
      } else if (e.key === '-') {
        e.preventDefault()
        useThemeStore.getState().decreaseFontSize()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

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

  // Ctrl/Cmd+S saves the active tab wherever focus is (sidebar, tab bar, a
  // dialog). The editor's own Mod-s binding handles it first and marks the
  // event defaultPrevented, so it never saves twice.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || !(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return
      if (e.key.toLowerCase() !== 's') return
      e.preventDefault()
      void useWorkspaceStore.getState().saveActiveTab()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

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
    if (vaultPath !== null)
      loadFiles()
        .then(restoreWorkspace)
        .then(() => setWorkspaceReady(true))
  }, [vaultPath, loadFiles, restoreWorkspace])

  // No vault configured: still restore external tabs (vault ones can't load)
  // so files opened from outside the app work without a vault.
  useEffect(() => {
    if (loading || vaultPath !== null || workspaceReady) return
    void restoreWorkspace().then(() => setWorkspaceReady(true))
  }, [loading, vaultPath, workspaceReady, restoreWorkspace])

  // Files opened via Open with / double-click / argv / macOS open-file.
  useEffect(() => {
    if (!workspaceReady) return
    return window.api.external.onOpenRequested((requests) => {
      void useOpenFilesStore.getState().openRequests(requests)
    })
  }, [workspaceReady])

  // Drag & drop from the file manager anywhere on the window: .md/.markdown/.txt
  // open as tabs. File drops are always swallowed so Chromium never navigates to
  // the dropped file. Listeners run in the capture phase, before components that
  // stopPropagation (sidebar tree). A drop onto the editor text is left for
  // CodeMirror to preventDefault — it skips its handlers (incl. attaching the
  // non-text files) once an event is defaultPrevented.
  useEffect(() => {
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes('Files') === true
    const onEditorText = (e: DragEvent) =>
      e.target instanceof Element && e.target.closest('.cm-content') !== null
    const onDragOver = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    }
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      if (!onEditorText(e)) e.preventDefault()
      const files = Array.from(e.dataTransfer?.files ?? [])
      if (files.length > 0) void useOpenFilesStore.getState().openDroppedFiles(files)
    }
    // Bubble-phase safety net: nothing handled the file drop → still swallow it.
    const onDropFallback = (e: DragEvent) => {
      if (hasFiles(e) && !e.defaultPrevented) e.preventDefault()
    }
    window.addEventListener('dragover', onDragOver, true)
    window.addEventListener('drop', onDrop, true)
    window.addEventListener('drop', onDropFallback)
    return () => {
      window.removeEventListener('dragover', onDragOver, true)
      window.removeEventListener('drop', onDrop, true)
      window.removeEventListener('drop', onDropFallback)
    }
  }, [])

  useEffect(() => {
    return window.api.window.onFilesChanged(() => {
      loadFiles()
    })
  }, [loadFiles])

  useEffect(() => {
    return window.api.reminder.onFired((payload) => {
      useCalendarStore.getState().setLastFired(payload)
      void useCalendarStore.getState().loadReminders()
    })
  }, [])

  useEffect(() => {
    return window.api.reminder.onNavigate((payload) => {
      if (payload.notePath) {
        // Locked notes go through the vault password prompt.
        void useEncryptionStore.getState().openNote(payload.notePath)
      }
    })
  }, [])

  return (
    <div className="relative flex h-screen flex-col font-sans">
      <BackgroundLayer />
      <TitleBar />
      <UpdateBar />
      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">{renderBody()}</div>

      <SearchPanel />

      <ConfirmDialog
        open={pendingClose !== null}
        title={t('app.unsavedClose.title')}
        message={t('app.unsavedClose.message', { name: pendingClose ?? '' })}
        confirmLabel={t('app.unsavedClose.save')}
        confirmTone="primary"
        onConfirm={confirmCloseSave}
        onDiscard={confirmCloseDiscard}
        discardLabel={t('app.unsavedClose.discard')}
        onCancel={cancelClose}
      />

      <ConfirmDialog
        open={pendingQuit}
        title={t('app.quit.title')}
        message={t('app.quit.message', { count: tabs.filter((tab) => tab.dirty).length })}
        confirmLabel={t('app.quit.confirm')}
        confirmTone="danger"
        // Enter must not throw away unsaved notes: it answers Cancel.
        initialFocus="cancel"
        onConfirm={() => {
          setPendingQuit(false)
          window.api.window.forceClose()
        }}
        onCancel={() => {
          setPendingQuit(false)
          window.api.window.cancelQuit()
        }}
      />

      <SaveConflictDialog />
      <UnlockDialog />
      <PatchNotesModal />
      <ReminderModal />
      <ReminderToast />
      <TrashToast />
      <OpenFileToast />
      <NoticeToast />

      {/* First-run import offer (Epic 15): shown once after the first vault pick. */}
      {offerFirstRunImport && vaultPath !== null && (
        <ImportWizard onClose={dismissFirstRunImport} />
      )}
    </div>
  )

  function renderBody() {
    if (loading && vaultPath === null) {
      return <div className="h-full bg-slate-950 light:bg-white" />
    }

    if (vaultPath === null) {
      // Files opened from outside the app work without a vault.
      return tabs.length > 0 ? <ContentPane /> : <EmptyState />
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
