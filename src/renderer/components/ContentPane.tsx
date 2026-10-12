import { TabBar } from '@renderer/components/TabBar'
import { EditorHost } from '@renderer/editor/EditorHost'
import { useT } from '@renderer/i18n'
import { useEncryptionStore } from '@renderer/stores/encryptionStore'
import { isExternalTabPath } from '@renderer/stores/externalPath'
import { useVaultStore } from '@renderer/stores/vaultStore'
import { useWorkspaceStore } from '@renderer/stores/workspaceStore'
import { FileText, Lock } from 'lucide-react'
import { useEffect } from 'react'

/**
 * Editor area: a tab bar over the shared CodeMirror editor, with the active
 * tab's full on-disk path in a header. When no tabs are open, shows the
 * empty "select a note" state.
 */
export function ContentPane() {
  const activeTabPath = useWorkspaceStore((s) => s.activeTabPath)
  const t = useT()
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const activeLocked = useWorkspaceStore(
    (s) => s.tabs.find((t) => t.path === s.activeTabPath)?.locked === true,
  )

  if (activeTabPath === null) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 bg-slate-950 text-slate-600 light:bg-white light:text-slate-400">
        <FileText className="size-8" aria-hidden="true" />
        <p className="text-sm">{t('app.contentPane.selectNote')}</p>
      </div>
    )
  }

  // Full on-disk path of the active tab (vault root + OS-correct separator);
  // an external tab's path is already absolute.
  const external = isExternalTabPath(activeTabPath)
  const sep = vaultPath?.includes('\\') ? '\\' : '/'
  const fullPath =
    !external && vaultPath !== null
      ? `${vaultPath}${sep}${activeTabPath.split('/').join(sep)}`
      : activeTabPath

  return (
    <div className="flex h-full flex-col bg-slate-950 light:bg-white">
      <TabBar />
      <div className="border-b border-slate-800 px-4 py-1.5 font-mono text-xs text-slate-500 light:border-slate-200 light:text-slate-400">
        <span className="block truncate" title={fullPath}>
          {external && (
            <span className="mr-2 rounded bg-slate-800 px-1.5 py-px font-sans text-[10px] uppercase tracking-wide text-slate-400 light:bg-slate-100 light:text-slate-500">
              {t('app.contentPane.external')}
            </span>
          )}
          {fullPath}
        </span>
      </div>
      <div className="relative flex-1 overflow-hidden">
        {/* The editor stays mounted (it caches the other tabs' editor states). */}
        <div className={activeLocked ? 'hidden' : 'h-full'}>
          <EditorHost />
        </div>
        {activeLocked && <LockedNotePane path={activeTabPath} />}
      </div>
    </div>
  )
}

/**
 * A locked-note tab whose content isn't loaded (vault locked — after a restart
 * or "Lock vault now"). Unlock opens the vault password prompt and loads the
 * note into this tab; once the vault is unlocked it loads on its own.
 */
function LockedNotePane({ path }: { path: string }) {
  const unlocked = useEncryptionStore((s) => s.unlocked)
  const openLocked = useEncryptionStore((s) => s.openLocked)
  const t = useT()

  useEffect(() => {
    if (unlocked) void useWorkspaceStore.getState().openTab(path)
  }, [unlocked, path])

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-slate-950 px-4 text-center light:bg-white">
      <Lock className="size-8 text-amber-500/80 light:text-amber-600" aria-hidden="true" />
      <div className="flex flex-col items-center gap-1.5">
        <h2 className="text-base font-medium text-slate-100 light:text-slate-900">
          {t('app.contentPane.lockedHeading')}
        </h2>
        <p className="max-w-sm text-sm text-slate-400 light:text-slate-500">
          {t('app.contentPane.lockedBody')}
        </p>
      </div>
      <button
        type="button"
        onClick={() => void openLocked(path)}
        className="rounded-md bg-accent-600 px-4 py-2 text-sm font-medium text-white shadow-sm shadow-accent-500/30 transition hover:bg-accent-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-400"
      >
        {t('app.contentPane.unlock')}
      </button>
    </div>
  )
}
