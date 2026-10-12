import { api } from '@renderer/api'
import { type TFunction, useT } from '@renderer/i18n'
import { useVaultStore } from '@renderer/stores/vaultStore'
import type { ImportProgressInfo, ImportResultInfo, ImportScanInfo } from '@shared/types'
import { FileArchive, FolderOpen } from 'lucide-react'
import { createElement, Fragment, type ReactNode, useEffect, useState } from 'react'

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
  const t = useT()
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
      setState({ step: 'error', message: describeError(t, scan.error) })
      return
    }
    if (scan.data.total === 0) {
      setState({ step: 'error', message: t('importer.error.noNotes') })
      return
    }
    setState({ step: 'preview', sourcePath: picked.data, scan: scan.data })
  }

  const runImport = async (sourcePath: string) => {
    setState({ step: 'importing', progress: null })
    const result = await api.import.execute({ sourcePath, destination })
    if (!result.ok) {
      setState({ step: 'error', message: describeError(t, result.error) })
      return
    }
    await loadFiles()
    setState({ step: 'done', result: result.data })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <button
        type="button"
        aria-label={t('common.close')}
        onClick={() => {
          if (state.step !== 'importing') onClose()
        }}
        className="absolute inset-0 size-full cursor-default bg-slate-950/70 backdrop-blur-sm"
      />
      <div
        className="relative mx-4 w-full max-w-md rounded-xl border border-slate-700/80 bg-slate-800 p-5 shadow-2xl shadow-black/50"
        role="dialog"
        aria-modal="true"
        aria-label={t('importer.title')}
      >
        <h2 className="text-base font-medium text-slate-100">{t('importer.title')}</h2>

        {state.step === 'pick' && (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-slate-400">{t('importer.pick.intro')}</p>
            <button
              type="button"
              onClick={() => void pickSource('folder')}
              className="flex w-full items-center gap-3 rounded-lg border border-slate-700 bg-slate-900 p-3 text-left transition hover:border-accent-500/60 hover:bg-slate-900/60"
            >
              <FolderOpen className="size-5 shrink-0 text-accent-400" aria-hidden="true" />
              <span>
                <span className="block text-sm font-medium text-slate-200">
                  {t('importer.pick.folderTitle')}
                </span>
                <span className="block text-xs text-slate-500">
                  {t('importer.pick.folderDescription')}
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
                <span className="block text-sm font-medium text-slate-200">
                  {t('importer.pick.notionTitle')}
                </span>
                <span className="block text-xs text-slate-500">
                  {t('importer.pick.notionDescription')}
                </span>
              </span>
            </button>
            <p className="text-xs text-slate-500">
              {rich(t('importer.pick.appleNotes'), {
                exporter: <span className="text-slate-400">{t('importer.pick.exporterName')}</span>,
              })}
            </p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded px-3 py-1.5 text-sm text-slate-300 transition hover:bg-slate-700"
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        )}

        {state.step === 'scanning' && (
          <p className="mt-4 text-sm text-slate-400">{t('importer.scanning')}</p>
        )}

        {state.step === 'preview' && (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-slate-300">
              {rich(t('importer.preview.found', { count: state.scan.total }), {
                total: <span className="font-semibold text-slate-100">{state.scan.total}</span>,
                source: <span className="font-medium text-slate-200">{state.scan.sourceName}</span>,
                details: formatCounts(t, state.scan),
              })}
            </p>
            <fieldset className="space-y-2">
              <legend className="text-xs font-medium uppercase tracking-wider text-slate-400">
                {t('importer.preview.importInto')}
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
                {t('importer.preview.vaultRoot')}
              </label>
            </fieldset>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded px-3 py-1.5 text-sm text-slate-300 transition hover:bg-slate-700"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={() => void runImport(state.sourcePath)}
                className="rounded bg-accent-600 px-3 py-1.5 text-sm text-white shadow-sm shadow-accent-500/30 transition hover:bg-accent-500"
              >
                {t('importer.preview.importButton', { count: state.scan.total })}
              </button>
            </div>
          </div>
        )}

        {state.step === 'importing' && (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-slate-400">
              {t('importer.importing')}{' '}
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
              {rich(
                t(
                  state.result.targetFolder !== ''
                    ? 'importer.done.importedInto'
                    : 'importer.done.imported',
                  { count: state.result.imported },
                ),
                {
                  total: (
                    <span className="font-semibold text-slate-100">{state.result.imported}</span>
                  ),
                  skipped:
                    state.result.skipped > 0 ? (
                      <span className="text-slate-500">
                        {t('importer.done.skipped', { count: state.result.skipped })}
                      </span>
                    ) : null,
                  folder: (
                    <span className="font-medium text-slate-200">{state.result.targetFolder}/</span>
                  ),
                },
              )}
            </p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded bg-accent-600 px-3 py-1.5 text-sm text-white shadow-sm shadow-accent-500/30 transition hover:bg-accent-500"
              >
                {t('common.done')}
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
                {t('common.close')}
              </button>
              <button
                type="button"
                onClick={() => setState({ step: 'pick' })}
                className="rounded bg-accent-600 px-3 py-1.5 text-sm text-white shadow-sm shadow-accent-500/30 transition hover:bg-accent-500"
              >
                {t('importer.error.tryAgain')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Renders a translated template whose {name} placeholders are React nodes
 * (styled counts, names), so word order stays per-language.
 */
function rich(template: string, nodes: Record<string, ReactNode>): ReactNode {
  const parts = template.split(/(\{\w+\})/).map((part) => {
    const name = /^\{(\w+)\}$/.exec(part)?.[1]
    return name !== undefined && Object.hasOwn(nodes, name) ? nodes[name] : part
  })
  return createElement(Fragment, null, ...parts)
}

function formatCounts(t: TFunction, scan: ImportScanInfo): string {
  if (scan.kind === 'notion-zip') return t('importer.counts.notion')
  const parts: string[] = []
  if (scan.counts.md > 0) parts.push(t('importer.counts.md', { count: scan.counts.md }))
  if (scan.counts.txt > 0) parts.push(t('importer.counts.txt', { count: scan.counts.txt }))
  if (scan.counts.html > 0) parts.push(t('importer.counts.html', { count: scan.counts.html }))
  if (scan.counts.rtf > 0) parts.push(t('importer.counts.rtf', { count: scan.counts.rtf }))
  if (scan.counts.text > 0) parts.push(t('importer.counts.other', { count: scan.counts.text }))
  return parts.length > 0
    ? t('importer.counts.list', { list: parts.join(', ') })
    : t('importer.counts.none')
}

function describeError(t: TFunction, error: string): string {
  if (error === 'unsupported-source') return t('importer.error.unsupported')
  if (error === 'no-vault') return t('importer.error.noVault')
  return t('importer.error.failed', { error })
}
