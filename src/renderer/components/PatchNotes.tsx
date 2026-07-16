import { useEffect, useState } from 'react'
import { X, Sparkles } from 'lucide-react'

declare const __APP_VERSION__: string

type ReleaseNote = {
  version: string
  date: string
  highlights: string[]
}

/**
 * Patch notes registry. Add new entries at the top when releasing.
 * Only the latest entry (matching current version) is shown in the modal.
 */
const RELEASES: ReleaseNote[] = [
  {
    version: '0.1.15',
    date: '2026-07-16',
    highlights: [
      'Takvim ve Hatırlatıcılar: sidebar\'da aylık takvim, günlük notlar, tarih bazlı hatırlatıcılar',
      'Hatırlatıcı tekrarlama: her gün, her hafta veya her ay otomatik tekrar',
      'Bildirime tıklayınca uygulama öne gelir ve ilgili not açılır',
      'Uygulama açılışında kaçırılmış hatırlatıcılar anında bildirilir',
      'Yazı boyutu ayarı: Settings slider + Ctrl+=/- + Ctrl+Mouse Wheel ile zoom',
      'Seçili metne font size uygulama (toolbar\'dan 12-48px arası)',
      'Tüm UI elementleri font boyutuyla orantılı ölçeklenir',
      'Klasör chevronları animasyonlu açılıp kapanır',
      'Satır katlama (fold) chevronları büyütüldü ve animasyon eklendi',
      'Select dropdown chevronları animasyonlu dönüş efekti',
      'Vault değiştirince tag\'lar doğru şekilde sıfırlanır',
      'Pencere kapanırken oluşan render frame hatası düzeltildi',
    ],
  },
  {
    version: '0.1.13',
    date: '2026-07-14',
    highlights: [
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
    highlights: [
      'Locked notes: encrypt sensitive notes with AES-256-GCM',
      'Auto-save with debounce',
      'Custom sidebar ordering (drag to reorder)',
    ],
  },
]

const STORAGE_KEY = 'slate:lastSeenVersion'

export function PatchNotesModal() {
  const [visible, setVisible] = useState(false)
  const [note, setNote] = useState<ReleaseNote | null>(null)

  useEffect(() => {
    const lastSeen = localStorage.getItem(STORAGE_KEY)
    const current = __APP_VERSION__
    if (lastSeen === current) return

    const entry = RELEASES.find((r) => r.version === current)
    if (entry) {
      setNote(entry)
      setVisible(true)
    }
    localStorage.setItem(STORAGE_KEY, current)
  }, [])

  if (!visible || !note) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60">
      <div className="relative w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-2xl light:border-slate-200 light:bg-white">
        <button
          type="button"
          onClick={() => setVisible(false)}
          className="absolute right-3 top-3 rounded p-1 text-slate-400 transition hover:bg-slate-800 hover:text-slate-200 light:hover:bg-slate-100 light:hover:text-slate-700"
        >
          <X className="size-4" />
        </button>

        <div className="mb-4 flex items-center gap-2">
          <Sparkles className="size-5 text-accent-400" />
          <h2 className="text-lg font-semibold text-slate-100 light:text-slate-900">
            What's New
          </h2>
          <span className="rounded-full bg-accent-500/20 px-2 py-0.5 text-xs font-medium text-accent-300 light:bg-accent-100 light:text-accent-700">
            v{note.version}
          </span>
        </div>

        <p className="mb-3 text-xs text-slate-400 light:text-slate-500">{note.date}</p>

        <ul className="space-y-2">
          {note.highlights.map((item) => (
            <li key={item} className="flex items-start gap-2 text-sm text-slate-300 light:text-slate-700">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent-400" />
              {item}
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={() => setVisible(false)}
          className="mt-6 w-full rounded-lg bg-accent-600 py-2 text-sm font-medium text-white transition hover:bg-accent-500"
        >
          Got it
        </button>
      </div>
    </div>
  )
}
