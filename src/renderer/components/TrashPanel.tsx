import { ConfirmDialog } from '@renderer/components/ConfirmDialog'
import { formatRelativeTime, type TFunction, useT } from '@renderer/i18n'
import { useTagsStore } from '@renderer/stores/tagsStore'
import { osTrash, useTrashStore } from '@renderer/stores/trashStore'
import type { TrashItem } from '@shared/types'
import { File, FolderClosed, Lock, RotateCcw, X } from 'lucide-react'
import { useEffect, useState } from 'react'

function relativeTime(iso: string, t: TFunction): string {
  const deletedAt = Date.parse(iso)
  if (Number.isNaN(deletedAt)) return ''
  // Exactly one day ago reads "yesterday" here, not "1 day ago".
  if (Math.floor((Date.now() - deletedAt) / 86_400_000) === 1) return t('sidebar.trash.yesterday')
  return formatRelativeTime(deletedAt)
}

function parentFolder(path: string, t: TFunction): string {
  const i = path.lastIndexOf('/')
  return i === -1 ? t('sidebar.trash.vaultRoot') : path.slice(0, i)
}

const iconButton =
  'shrink-0 rounded-md p-1 text-slate-400 transition hover:bg-slate-800 hover:text-accent-300 light:text-slate-500 light:hover:bg-slate-100'

type Pending = { kind: 'empty' } | { kind: 'item'; item: TrashItem }

/** Sidebar Trash view: lists trashed notes/folders with restore / permanent delete. */
export function TrashPanel() {
  const t = useT()
  const items = useTrashStore((s) => s.items)
  const loading = useTrashStore((s) => s.loading)
  const loadTrash = useTrashStore((s) => s.loadTrash)
  const restore = useTrashStore((s) => s.restore)
  const deletePermanently = useTrashStore((s) => s.deletePermanently)
  const emptyTrash = useTrashStore((s) => s.emptyTrash)
  const [pending, setPending] = useState<Pending | null>(null)

  useEffect(() => {
    void loadTrash()
  }, [loadTrash])

  const handleRestore = async (id: string) => {
    const path = await restore(id)
    if (path !== null) void useTagsStore.getState().loadTags()
  }

  const confirm = () => {
    const p = pending
    setPending(null)
    if (p === null) return
    if (p.kind === 'empty') void emptyTrash()
    else void deletePermanently(p.item.id)
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-3 py-1.5">
        <span className="text-[11px] text-slate-500 light:text-slate-400">
          {t('sidebar.trash.info', { osTrashTo: osTrash('to') })}
        </span>
        <button
          type="button"
          onClick={() => setPending({ kind: 'empty' })}
          disabled={items.length === 0}
          className="shrink-0 rounded px-2 py-0.5 text-[11px] font-medium text-red-400 transition hover:bg-red-500/10 disabled:opacity-40 disabled:hover:bg-transparent"
        >
          {t('sidebar.trash.emptyTrash')}
        </button>
      </div>

      {items.length === 0 ? (
        <div className="px-3 py-4 text-xs text-slate-500">
          {loading ? t('common.loading') : t('sidebar.trash.empty')}
        </div>
      ) : (
        items.map((item) => {
          const locked = item.kind === 'note' && item.name.toLowerCase().endsWith('.enc')
          const Icon = item.kind === 'folder' ? FolderClosed : locked ? Lock : File
          return (
            <div
              key={item.id}
              className="flex items-center gap-2 border-b border-slate-800 px-3 py-2 transition hover:bg-slate-800/60 light:border-slate-100 light:hover:bg-slate-50"
            >
              <Icon className="size-3.5 shrink-0 text-slate-500" aria-hidden="true" />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-sm font-medium text-slate-200 light:text-slate-800">
                  {item.name}
                </span>
                <span className="truncate text-[11px] text-slate-500 light:text-slate-400">
                  {parentFolder(item.originalPath, t)} · {relativeTime(item.deletedAt, t)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => void handleRestore(item.id)}
                title={t('sidebar.trash.restore')}
                className={iconButton}
              >
                <RotateCcw className="size-3.5" aria-hidden="true" />
                <span className="sr-only">{t('sidebar.trash.restore')}</span>
              </button>
              <button
                type="button"
                onClick={() => setPending({ kind: 'item', item })}
                title={t('sidebar.trash.deletePermanently')}
                className="shrink-0 rounded-md p-1 text-slate-400 transition hover:bg-slate-800 hover:text-red-400 light:text-slate-500 light:hover:bg-slate-100"
              >
                <X className="size-3.5" aria-hidden="true" />
                <span className="sr-only">{t('sidebar.trash.deletePermanently')}</span>
              </button>
            </div>
          )
        })
      )}

      <ConfirmDialog
        open={pending !== null}
        title={
          pending?.kind === 'empty'
            ? t('sidebar.trash.emptyTrash')
            : t('sidebar.trash.deletePermanently')
        }
        message={
          pending?.kind === 'item'
            ? pending.item.osTrashed
              ? t('sidebar.trash.confirmItemOsTrashed', {
                  name: pending.item.name,
                  osTrashIn: osTrash('in'),
                })
              : t('sidebar.trash.confirmItem', {
                  name: pending.item.name,
                  osTrashTo: osTrash('to'),
                })
            : t('sidebar.trash.confirmEmpty', { count: items.length, osTrashIn: osTrash('in') })
        }
        confirmLabel={
          pending?.kind === 'empty' ? t('sidebar.trash.emptyTrash') : t('sidebar.trash.delete')
        }
        confirmTone="danger"
        onConfirm={confirm}
        onCancel={() => setPending(null)}
      />
    </div>
  )
}
