import { api } from '@renderer/api'
import { useVaultStore } from '@renderer/stores/vaultStore'
import type { ImportProgressInfo, ImportResultInfo, ImportScanInfo } from '@shared/types'
import { FileArchive, FolderOpen } from 'lucide-react'
import { useEffect, useState } from 'react'

type WizardStep =
  | { step: 'pick' }
  | { step: 'scanning' }
  | { step: 'preview'; sourcePath: string; scan: ImportScanInfo }
  | { step: 'importing'; progress: ImportProgressInfo | null }
  | { step: 'done'; result: ImportResultInfo }
  | { step: 'error'; message: string }

/**
 * Import wizard modal (Epic 15): pick a source (folder or Notion zip) →
 * preview what a scan found → confirm destination → progress → done.
 * Originals are never modified; import always copies into the vault.
 */
export function ImportWizard({ onClose }: { onClose: () => void }) {
  const loadFiles = useVaultStore((s) => s.loadFiles)
  const [state, setState] = useState<WizardStep>({ step: 'pick' })
  const [destination, setDestination] = useState<'imported-subfolder' | 'root'>(
    'imported-subfolder',
  )

  // Progress events stream from main while an import runs.
  useEffect(() => {
    return api.import.onProgress((p) => {
      setState((s) => (s.step === 'importing' ? { step: 'importing', progress: p } : s))
    })
  }, [])

  // Escape closes, except mid-import (the copy loop shouldn't lose its UI).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && state.step !== 'importing') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state.step, onClose])

  const pickSource = async (kind: 'folder' | 'zip') => {
    const picked = await api.import.pickSource({ kind })
    if (!picked.ok || picked.data === null) return
    setState({ step: 'scanning' })
    const scan = await api.import.scan(picked.data)
    if (!scan.ok) {
      setState({ step: 'error', message: describeError(scan.error) })
      return
    }
    if (scan.data.total === 0) {
      setState({ step: 'error', message: 'No importable notes found in that source.' })
      return
    }
    setState({ step: 'preview', sourcePath: picked.data, scan: scan.data })
  }

  const runImport = async (sourcePath: string) => {
    setState({ step: 'importing', progress: null })
    const result = await api.import.execute({ sourcePath, destination })
    if (!result.ok) {
      setState({ step: 'error', message: describeError(result.error) })
      return
    }
    await loadFiles()
    setState({ step: 'done', result: result.data })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <button
        type="button"
        aria-label="Close"
        onClick={() => {
          if (state.step !== 'importing') onClose()
        }}
        className="absolute inset-0 size-full cursor-default bg-slate-950/70 backdrop-blur-sm"
      />
      <div
        className="relative mx-4 w-full max-w-md rounded-xl border border-slate-700/80 bg-slate-800 p-5 shadow-2xl shadow-black/50"
        role="dialog"
        aria-modal="true"
        aria-label="Import notes"
      >
        <h2 className="text-base font-medium text-slate-100">Import notes</h2>

        {state.step === 'pick' && (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-slate-400">
              Bring existing notes into Slate. Originals are never changed — files are copied into
              your vault.
            </p>
            <button
              type="button"
              onClick={() => void pickSource('folder')}
              className="flex w-full items-center gap-3 rounded-lg border border-slate-700 bg-slate-900 p-3 text-left transition hover:border-accent-500/60 hover:bg-slate-900/60"
            >
              <FolderOpen className="size-5 shrink-0 text-accent-400" aria-hidden="true" />
              <span>
                <span className="block text-sm font-medium text-slate-200">Folder of notes</span>
                <span className="block text-xs text-slate-500">
                  Any text files — Markdown, .txt, HTML, RTF, code, extension-less notes.
                  Subfolders are kept.
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => void pickSource('zip')}
              className="flex w-full items-center gap-3 rounded-lg border border-slate-700 bg-slate-900 p-3 text-left transition hover:border-accent-500/60 hover:bg-slate-900/60"
            >
              <FileArchive className="size-5 shrink-0 text-accent-400" aria-hidden="true" />
              <span>
                <span className="block text-sm font-medium text-slate-200">Notion export</span>
                <span className="block text-xs text-slate-500">
                  .zip from Notion's "Export" (Markdown & CSV format)
                </span>
              </span>
            </button>
            <p className="text-xs text-slate-500">
              Apple Notes? It has no bulk export — use a free tool like{' '}
              <span className="text-slate-400">Exporter</span> (Mac App Store) to export your notes
              as Markdown or HTML files first, then import that folder here.
            </p>
          </div>
        )}

        {state.step === 'scanning' && (
          <p className="mt-4 text-sm text-slate-400">Scanning source…</p>
        )}

        {state.step === 'preview' && (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-slate-300">
              Found <span className="font-semibold text-slate-100">{state.scan.total}</span>{' '}
              {state.scan.total === 1 ? 'note' : 'notes'} in{' '}
              <span className="font-medium text-slate-200">{state.scan.sourceName}</span>
              {formatCounts(state.scan)}
            </p>
            <fieldset className="space-y-2">
              <legend className="text-xs font-medium uppercase tracking-wider text-slate-400">
                Import into
              </legend>
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input
                  type="radio"
                  name="destination"
                  checked={destination === 'imported-subfolder'}
                  onChange={() => setDestination('imported-subfolder')}
                  className="accent-accent-500"
                />
                Imported/{state.scan.sourceName}/
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input
                  type="radio"
                  name="destination"
                  checked={destination === 'root'}
                  onChange={() => setDestination('root')}
                  className="accent-accent-500"
                />
                Vault root
              </label>
            </fieldset>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded px-3 py-1.5 text-sm text-slate-300 transition hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void runImport(state.sourcePath)}
                className="rounded bg-accent-600 px-3 py-1.5 text-sm text-white shadow-sm shadow-accent-500/30 transition hover:bg-accent-500"
              >
                Import {state.scan.total} {state.scan.total === 1 ? 'note' : 'notes'}
              </button>
            </div>
          </div>
        )}

        {state.step === 'importing' && (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-slate-400">
              Importing…{' '}
              {state.progress !== null && (
                <span className="text-slate-300">
                  {state.progress.done}/{state.progress.total}
                </span>
              )}
            </p>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-700">
              <div
                className="h-full rounded-full bg-accent-500 transition-all"
                style={{
                  width:
                    state.progress !== null && state.progress.total > 0
                      ? `${(state.progress.done / state.progress.total) * 100}%`
                      : '0%',
                }}
              />
            </div>
            {state.progress !== null && state.progress.currentFile !== '' && (
              <p className="truncate text-xs text-slate-500">{state.progress.currentFile}</p>
            )}
          </div>
        )}

        {state.step === 'done' && (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-slate-300">
              Imported <span className="font-semibold text-slate-100">{state.result.imported}</span>{' '}
              {state.result.imported === 1 ? 'note' : 'notes'}
              {state.result.skipped > 0 && (
                <span className="text-slate-500"> ({state.result.skipped} skipped)</span>
              )}
              {state.result.targetFolder !== '' && (
                <>
                  {' '}
                  into <span className="font-medium text-slate-200">
                    {state.result.targetFolder}/
                  </span>
                </>
              )}
              . They're indexed and searchable now.
            </p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded bg-accent-600 px-3 py-1.5 text-sm text-white shadow-sm shadow-accent-500/30 transition hover:bg-accent-500"
              >
                Done
              </button>
            </div>
          </div>
        )}

        {state.step === 'error' && (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-red-400">{state.message}</p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded px-3 py-1.5 text-sm text-slate-300 transition hover:bg-slate-700"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => setState({ step: 'pick' })}
                className="rounded bg-accent-600 px-3 py-1.5 text-sm text-white shadow-sm shadow-accent-500/30 transition hover:bg-accent-500"
              >
                Try again
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function formatCounts(scan: ImportScanInfo): string {
  if (scan.kind === 'notion-zip') return ' (Notion export).'
  const parts: string[] = []
  if (scan.counts.md > 0) parts.push(`${scan.counts.md} markdown`)
  if (scan.counts.txt > 0) parts.push(`${scan.counts.txt} text`)
  if (scan.counts.html > 0) parts.push(`${scan.counts.html} HTML`)
  if (scan.counts.rtf > 0) parts.push(`${scan.counts.rtf} RTF`)
  if (scan.counts.text > 0) parts.push(`${scan.counts.text} other plain-text`)
  return parts.length > 0 ? ` (${parts.join(', ')}).` : '.'
}

function describeError(error: string): string {
  if (error === 'unsupported-source') return 'That file type is not supported — pick a .zip export.'
  if (error === 'no-vault') return 'No vault is configured yet — choose a vault folder first.'
  return `Import failed: ${error}`
}
