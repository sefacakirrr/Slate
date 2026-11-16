import { type TFunction, useT } from '@renderer/i18n'
import { Sparkles, X } from 'lucide-react'
import { useEffect, useState } from 'react'

declare const __APP_VERSION__: string

type ReleaseNote = {
  version: string
  date: string
  /** The current release is translated via the dictionary; older ones stay English. */
  highlights: (t: TFunction) => string[]
}

/**
 * Patch notes registry. Add new entries at the top when releasing.
 * Only the latest entry (matching current version) is shown in the modal.
 */
const RELEASES: ReleaseNote[] = [
  {
    version: '0.1.17',
    date: '2026-11-16',
    highlights: (t) => [
      t('patchNotes.v0117.h01'),
      t('patchNotes.v0117.h02'),
      t('patchNotes.v0117.h03'),
    ],
  },
  {
    version: '0.1.16',
    date: '2026-10-12',
    highlights: (t) => [
      t('patchNotes.v0116.h01'),
      t('patchNotes.v0116.h02'),
      t('patchNotes.v0116.h03'),
      t('patchNotes.v0116.h04'),
      t('patchNotes.v0116.h05'),
      t('patchNotes.v0116.h06'),
      t('patchNotes.v0116.h07'),
      t('patchNotes.v0116.h08'),
      t('patchNotes.v0116.h09'),
      t('patchNotes.v0116.h10'),
      t('patchNotes.v0116.h11'),
      t('patchNotes.v0116.h12'),
      t('patchNotes.v0116.h13'),
      t('patchNotes.v0116.h14'),
    ],
  },
  {
    version: '0.1.15',
    date: '2026-07-16',
    highlights: (t) => [
      t('patchNotes.v0115.h01'),
      t('patchNotes.v0115.h02'),
      t('patchNotes.v0115.h03'),
      t('patchNotes.v0115.h04'),
      t('patchNotes.v0115.h05'),
      t('patchNotes.v0115.h06'),
      t('patchNotes.v0115.h07'),
      t('patchNotes.v0115.h08'),
      t('patchNotes.v0115.h09'),
      t('patchNotes.v0115.h10'),
      t('patchNotes.v0115.h11'),
      t('patchNotes.v0115.h12'),
    ],
  },
  {
    version: '0.1.13',
    date: '2026-07-14',
    highlights: () => [
      'Editor color themes: Dracula, Nord, Monokai, Solarized, GitHub Dark, One Dark + more',
      'Import custom themes from JSON files',
      'Background image support with opacity control',
      'Tab context menu: Close, Close Others, Close to the Right, Close All',
      'Password hint for locked notes — shown on wrong password',
      'Pinned notes now sync theme changes in real-time',
      'Long lines can be collapsed with a gutter chevron',
      'Images protected from accidental inline edits',
      'D: drive installation fix',
    ],
  },
  {
    version: '0.1.11',
    date: '2026-07-10',
    highlights: () => [
      'Locked notes: encrypt sensitive notes with AES-256-GCM',
      'Auto-save with debounce',
      'Custom sidebar ordering (drag to reorder)',
    ],
  },
]

const STORAGE_KEY = 'slate:lastSeenVersion'

function markSeen(): void {
  localStorage.setItem(STORAGE_KEY, __APP_VERSION__)
}

export function PatchNotesModal() {
  const t = useT()
  const [visible, setVisible] = useState(false)
  const [note, setNote] = useState<ReleaseNote | null>(null)

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY) === __APP_VERSION__) return

    const entry = RELEASES.find((r) => r.version === __APP_VERSION__)
    if (entry) {
      // Marked seen only on dismiss: the renderer also mounts when Slate starts
      // hidden at login, and the user must still see the notes when they open it.
      setNote(entry)
      setVisible(true)
    } else {
      markSeen()
    }
  }, [])

  useEffect(() => {
    if (!visible) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        markSeen()
        setVisible(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [visible])

  if (!visible || !note) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
      {/* Header and button stay put; only the list scrolls when it is taller than the window. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="patch-notes-title"
        className="relative flex max-h-full w-full max-w-md flex-col rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-2xl light:border-slate-200 light:bg-white"
      >
        <button
          type="button"
          onClick={() => {
            markSeen()
            setVisible(false)
          }}
          title={t('common.close')}
          className="absolute right-3 top-3 rounded p-1 text-slate-400 transition hover:bg-slate-800 hover:text-slate-200 light:hover:bg-slate-100 light:hover:text-slate-700"
        >
          <X className="size-4" />
        </button>

        <div className="mb-4 flex shrink-0 items-center gap-2 pr-8">
          <Sparkles className="size-5 text-accent-400" />
          <h2
            id="patch-notes-title"
            className="text-lg font-semibold text-slate-100 light:text-slate-900"
          >
            {t('patchNotes.title')}
          </h2>
          <span className="rounded-full bg-accent-500/20 px-2 py-0.5 text-xs font-medium text-accent-300 light:bg-accent-100 light:text-accent-700">
            v{note.version}
          </span>
        </div>

        <p className="mb-3 shrink-0 text-xs text-slate-400 light:text-slate-500">{note.date}</p>

        <ul className="-mr-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-3">
          {note.highlights(t).map((item) => (
            <li
              key={item}
              className="flex items-start gap-2 text-sm text-slate-300 light:text-slate-700"
            >
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent-400" />
              {item}
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={() => {
            markSeen()
            setVisible(false)
          }}
          className="mt-6 w-full shrink-0 rounded-lg bg-accent-600 py-2 text-sm font-medium text-white transition hover:bg-accent-500"
        >
          {t('patchNotes.gotIt')}
        </button>
      </div>
    </div>
  )
}
