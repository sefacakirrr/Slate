import { Logo } from '@renderer/components/Logo'
import { useVaultStore } from '@renderer/stores/vaultStore'
import { FolderOpen } from 'lucide-react'

/**
 * First-launch view shown when no vault folder is configured. The single
 * action opens the native folder picker via the vault store.
 */
export function EmptyState() {
  const pickAndSetVault = useVaultStore((s) => s.pickAndSetVault)
  const loading = useVaultStore((s) => s.loading)

  return (
    <div className="h-full flex flex-col items-center justify-center gap-8 bg-slate-950 font-sans">
      <div className="flex items-center gap-2.5">
        <Logo className="size-8 shrink-0 rounded-lg" />
        <span className="text-xl font-semibold tracking-tight text-slate-100">Slate</span>
      </div>
      <div className="flex flex-col items-center gap-2.5 text-center">
        <FolderOpen className="size-9 text-accent-400/80" aria-hidden="true" />
        <h1 className="text-lg font-medium text-slate-100">No vault selected</h1>
        <p className="max-w-sm text-sm text-slate-400">
          Choose a folder to use as your vault. Slate reads and writes Markdown files there.
        </p>
      </div>
      <button
        type="button"
        onClick={pickAndSetVault}
        disabled={loading}
        className="rounded-md bg-accent-600 px-4 py-2 font-medium text-white shadow-sm shadow-accent-500/30 transition hover:bg-accent-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-400 disabled:opacity-50"
      >
        Choose Folder
      </button>
    </div>
  )
}
