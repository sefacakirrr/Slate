import { TabBar } from '@renderer/components/TabBar'
import { EditorHost } from '@renderer/editor/EditorHost'
import { useVaultStore } from '@renderer/stores/vaultStore'
import { useWorkspaceStore } from '@renderer/stores/workspaceStore'
import { FileText } from 'lucide-react'

/**
 * Editor area: a tab bar over the shared CodeMirror editor, with the active
 * tab's full on-disk path in a header. When no tabs are open, shows the
 * empty "select a note" state.
 */
export function ContentPane() {
  const activeTabPath = useWorkspaceStore((s) => s.activeTabPath)
  const vaultPath = useVaultStore((s) => s.vaultPath)

  if (activeTabPath === null) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 bg-slate-950 text-slate-600 light:bg-white light:text-slate-400">
        <FileText className="size-8" aria-hidden="true" />
        <p className="text-sm">Select a note to view it.</p>
      </div>
    )
  }

  // Full on-disk path of the active tab (vault root + OS-correct separator).
  const sep = vaultPath?.includes('\\') ? '\\' : '/'
  const fullPath =
    vaultPath !== null ? `${vaultPath}${sep}${activeTabPath.split('/').join(sep)}` : activeTabPath

  return (
    <div className="flex h-full flex-col bg-slate-950 light:bg-white">
      <TabBar />
      <div className="border-b border-slate-800 px-4 py-1.5 font-mono text-xs text-slate-500 light:border-slate-200 light:text-slate-400">
        <span className="block truncate" title={fullPath}>
          {fullPath}
        </span>
      </div>
      <div className="flex-1 overflow-hidden">
        <EditorHost />
      </div>
    </div>
  )
}
