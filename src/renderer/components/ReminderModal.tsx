import { AnimatedSelect } from '@renderer/components/AnimatedSelect'
import { useCalendarStore } from '@renderer/stores/calendarStore'
import { useWorkspaceStore } from '@renderer/stores/workspaceStore'
import type { ReminderRecurrence } from '@shared/types'
import { Bell } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

const ALERT_OPTIONS = [
  { value: 0, label: 'Tam zamanında' },
  { value: 5, label: '5 dakika önce' },
  { value: 15, label: '15 dakika önce' },
  { value: 30, label: '30 dakika önce' },
  { value: 60, label: '1 saat önce' },
  { value: 1440, label: '1 gün önce' },
]

const RECURRENCE_OPTIONS: { value: ReminderRecurrence; label: string }[] = [
  { value: 'none', label: 'Tekrarlama' },
  { value: 'daily', label: 'Her gün' },
  { value: 'weekly', label: 'Her hafta' },
  { value: 'monthly', label: 'Her ay' },
]

const inputClass =
  'w-full rounded-md bg-slate-900 px-3 py-2 text-sm text-slate-100 outline outline-1 outline-slate-600 focus:outline-accent-500 light:bg-slate-100 light:text-slate-900 light:outline-slate-300 [color-scheme:dark] light:[color-scheme:light]'

export function ReminderModal() {
  const { reminderModalOpen, reminderModalDate, closeReminderModal, addReminder } =
    useCalendarStore()
  const activeTab = useWorkspaceStore((s) => s.activeTabPath)

  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('09:00')
  const [alertBefore, setAlertBefore] = useState(0)
  const [recurrence, setRecurrence] = useState<ReminderRecurrence>('none')
  const [linkNote, setLinkNote] = useState(false)

  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (reminderModalOpen) {
      setTitle('')
      setDate(reminderModalDate ?? new Date().toISOString().slice(0, 10))
      setTime('09:00')
      setAlertBefore(0)
      setRecurrence('none')
      setLinkNote(false)
      setTimeout(() => titleRef.current?.focus(), 50)
    }
  }, [reminderModalOpen, reminderModalDate])

  useEffect(() => {
    if (!reminderModalOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeReminderModal()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [reminderModalOpen, closeReminderModal])

  if (!reminderModalOpen) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !date || !time) return
    const fireAt = new Date(`${date}T${time}:00`).toISOString()
    await addReminder({
      title: title.trim(),
      notePath: linkNote ? activeTab : null,
      fireAt,
      alertBefore,
      recurrence,
    })
    closeReminderModal()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
        onClick={closeReminderModal}
        aria-label="Kapat"
      />
      {/* Dialog */}
      <form
        onSubmit={handleSubmit}
        className="relative z-10 w-full max-w-sm rounded-xl border border-slate-700/80 bg-slate-800 p-5 shadow-2xl light:border-slate-300 light:bg-white"
      >
        <div className="mb-4 flex items-center gap-2">
          <Bell size={18} className="text-accent-400" />
          <h2 className="text-sm font-semibold text-slate-100 light:text-slate-900">
            Hatırlatıcı Oluştur
          </h2>
        </div>

        {/* Title */}
        <label className="mb-3 block">
          <span className="mb-1 block text-xs text-slate-400 light:text-slate-600">Başlık</span>
          <input
            ref={titleRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ne hatırlatılsın?"
            className={inputClass}
          />
        </label>

        {/* Date & Time */}
        <div className="mb-3 flex gap-2">
          <label className="flex-1">
            <span className="mb-1 block text-xs text-slate-400 light:text-slate-600">Tarih</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="w-28">
            <span className="mb-1 block text-xs text-slate-400 light:text-slate-600">Saat</span>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className={inputClass}
            />
          </label>
        </div>

        {/* Alert before & Recurrence */}
        <div className="mb-3 flex gap-2">
          <label className="flex-1">
            <span className="mb-1 block text-xs text-slate-400 light:text-slate-600">
              Uyarı Zamanı
            </span>
            <AnimatedSelect
              value={alertBefore}
              onChange={(e) => setAlertBefore(Number(e.target.value))}
              className={inputClass}
            >
              {ALERT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </AnimatedSelect>
          </label>
          <label className="flex-1">
            <span className="mb-1 block text-xs text-slate-400 light:text-slate-600">
              Tekrar
            </span>
            <AnimatedSelect
              value={recurrence}
              onChange={(e) => setRecurrence(e.target.value as ReminderRecurrence)}
              className={inputClass}
            >
              {RECURRENCE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </AnimatedSelect>
          </label>
        </div>

        {/* Link to current note */}
        {activeTab && (
          <label className="mb-4 flex items-center gap-2">
            <input
              type="checkbox"
              checked={linkNote}
              onChange={(e) => setLinkNote(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-slate-600 bg-slate-900 text-accent-500 focus:ring-accent-500"
            />
            <span className="text-xs text-slate-400 light:text-slate-600">
              Mevcut nota bağla ({activeTab.split('/').pop()})
            </span>
          </label>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={closeReminderModal}
            className="rounded-md bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-600 light:bg-slate-200 light:text-slate-700 light:hover:bg-slate-300"
          >
            İptal
          </button>
          <button
            type="submit"
            disabled={!title.trim() || !date || !time}
            className="rounded-md bg-accent-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm shadow-accent-500/30 hover:bg-accent-500 disabled:opacity-50 disabled:hover:bg-accent-600"
          >
            Hatırlatıcı Oluştur
          </button>
        </div>
      </form>
    </div>
  )
}
