import { AnimatedSelect } from '@renderer/components/AnimatedSelect'
import { type TFunction, useT } from '@renderer/i18n'
import { useCalendarStore } from '@renderer/stores/calendarStore'
import { isExternalTabPath } from '@renderer/stores/externalPath'
import { useWorkspaceStore } from '@renderer/stores/workspaceStore'
import type { ReminderRecurrence } from '@shared/types'
import { Bell } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

/** Minutes before the reminder at which it fires. */
const ALERT_MINUTES = [0, 5, 15, 30, 60, 1440]

function alertLabel(t: TFunction, minutes: number): string {
  if (minutes === 0) return t('calendar.modal.alert.atTime')
  if (minutes % 1440 === 0) return t('calendar.modal.alert.daysBefore', { count: minutes / 1440 })
  if (minutes % 60 === 0) return t('calendar.modal.alert.hoursBefore', { count: minutes / 60 })
  return t('calendar.modal.alert.minutesBefore', { count: minutes })
}

const RECURRENCES: ReminderRecurrence[] = ['none', 'daily', 'weekly', 'monthly']

/** `YYYY-MM-DD` in local time (`toISOString` is UTC: yesterday just after midnight east of UTC). */
function localDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const inputClass =
  'w-full rounded-md bg-slate-900 px-3 py-2 text-sm text-slate-100 outline outline-1 outline-slate-600 focus:outline-accent-500 light:bg-slate-100 light:text-slate-900 light:outline-slate-300 [color-scheme:dark] light:[color-scheme:light]'

export function ReminderModal() {
  const { reminderModalOpen, reminderModalDate, closeReminderModal, addReminder } =
    useCalendarStore()
  const t = useT()
  // External (outside-vault) tabs can't be linked to a reminder.
  const activeTab = useWorkspaceStore((s) =>
    s.activeTabPath !== null && !isExternalTabPath(s.activeTabPath) ? s.activeTabPath : null,
  )

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
      setDate(reminderModalDate ?? localDateString(new Date()))
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
        aria-label={t('calendar.modal.close')}
      />
      {/* Dialog */}
      <form
        onSubmit={handleSubmit}
        className="relative z-10 w-full max-w-sm rounded-xl border border-slate-700/80 bg-slate-800 p-5 shadow-2xl light:border-slate-300 light:bg-white"
      >
        <div className="mb-4 flex items-center gap-2">
          <Bell size={18} className="text-accent-400" />
          <h2 className="text-sm font-semibold text-slate-100 light:text-slate-900">
            {t('calendar.modal.heading')}
          </h2>
        </div>

        {/* Title */}
        <label className="mb-3 block">
          <span className="mb-1 block text-xs text-slate-400 light:text-slate-600">
            {t('calendar.modal.title')}
          </span>
          <input
            ref={titleRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('calendar.modal.titlePlaceholder')}
            className={inputClass}
          />
        </label>

        {/* Date & Time */}
        <div className="mb-3 flex gap-2">
          <label className="flex-1">
            <span className="mb-1 block text-xs text-slate-400 light:text-slate-600">
              {t('calendar.modal.date')}
            </span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="w-28">
            <span className="mb-1 block text-xs text-slate-400 light:text-slate-600">
              {t('calendar.modal.time')}
            </span>
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
              {t('calendar.modal.alertBefore')}
            </span>
            <AnimatedSelect
              value={alertBefore}
              onChange={(e) => setAlertBefore(Number(e.target.value))}
              className={inputClass}
            >
              {ALERT_MINUTES.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {alertLabel(t, minutes)}
                </option>
              ))}
            </AnimatedSelect>
          </label>
          <label className="flex-1">
            <span className="mb-1 block text-xs text-slate-400 light:text-slate-600">
              {t('calendar.modal.recurrence')}
            </span>
            <AnimatedSelect
              value={recurrence}
              onChange={(e) => setRecurrence(e.target.value as ReminderRecurrence)}
              className={inputClass}
            >
              {RECURRENCES.map((value) => (
                <option key={value} value={value}>
                  {t(`calendar.modal.repeat.${value}`)}
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
              {t('calendar.modal.linkNote', { name: activeTab.split('/').pop() ?? '' })}
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
            {t('calendar.modal.cancel')}
          </button>
          <button
            type="submit"
            disabled={!title.trim() || !date || !time}
            className="rounded-md bg-accent-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm shadow-accent-500/30 hover:bg-accent-500 disabled:opacity-50 disabled:hover:bg-accent-600"
          >
            {t('calendar.modal.submit')}
          </button>
        </div>
      </form>
    </div>
  )
}
