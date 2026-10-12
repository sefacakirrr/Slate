import { ConfirmDialog } from '@renderer/components/ConfirmDialog'
import {
  localeTag,
  monthNames,
  useLanguage,
  useT,
  weekdayLabels,
  weekStartsOn,
} from '@renderer/i18n'
import { useCalendarStore } from '@renderer/stores/calendarStore'
import { useWorkspaceStore } from '@renderer/stores/workspaceStore'
import type { ReminderRecord } from '@shared/types'
import { Bell, ChevronLeft, ChevronRight, Plus, Repeat, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

/**
 * 42 cells (6 weeks) for the month grid: leading blanks so day 1 lands under its
 * weekday column, given the first column is `weekStart` (0 = Sunday, 1 = Monday).
 */
function getCalendarDays(year: number, month: number, weekStart: 0 | 1): (number | null)[] {
  const offset = (new Date(year, month, 1).getDay() - weekStart + 7) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = []
  for (let i = 0; i < offset; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length < 42) cells.push(null)
  return cells
}

export function CalendarPanel() {
  const {
    viewMonth,
    setViewMonth,
    daysWithNotes,
    reminders,
    loadMonthNotes,
    loadReminders,
    openDailyNote,
    openReminderModal,
    removeReminder,
  } = useCalendarStore()
  const [pendingDelete, setPendingDelete] = useState<ReminderRecord | null>(null)
  const t = useT()
  const language = useLanguage()
  const weekStart = weekStartsOn(language)
  const months = useMemo(() => monthNames(language), [language])
  const dayLabels = useMemo(() => weekdayLabels(language), [language])

  // Upcoming (not yet fired) reminders, soonest first.
  const upcoming = useMemo(
    () =>
      reminders
        .filter((r) => !r.fired)
        .sort((a, b) => new Date(a.fireAt).getTime() - new Date(b.fireAt).getTime()),
    [reminders],
  )
  const openTab = useWorkspaceStore((s) => s.openTab)

  const [year, month] = useMemo(() => {
    const [y, m] = viewMonth.split('-').map(Number)
    return [y, m - 1]
  }, [viewMonth])

  const days = useMemo(() => getCalendarDays(year, month, weekStart), [year, month, weekStart])

  const noteDays = useMemo(() => {
    const set = new Set<number>()
    for (const p of daysWithNotes) {
      const name = p.slice('daily/'.length).replace(/\.\w+$/, '')
      const day = Number.parseInt(name.split('-')[2], 10)
      if (!Number.isNaN(day)) set.add(day)
    }
    return set
  }, [daysWithNotes])

  const reminderDays = useMemo(() => {
    const set = new Set<number>()
    for (const r of reminders) {
      if (r.fired) continue
      const d = new Date(r.fireAt)
      if (d.getFullYear() === year && d.getMonth() === month) {
        set.add(d.getDate())
      }
    }
    return set
  }, [reminders, year, month])

  useEffect(() => {
    void loadMonthNotes(viewMonth)
    void loadReminders()
  }, [viewMonth, loadMonthNotes, loadReminders])

  const today = new Date()
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month

  function prevMonth() {
    const d = new Date(year, month - 1, 1)
    setViewMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  function nextMonth() {
    const d = new Date(year, month + 1, 1)
    setViewMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  async function handleDayClick(day: number) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const path = await openDailyNote(dateStr)
    if (path) openTab(path)
  }

  function handleReminderClick(e: React.MouseEvent, day: number) {
    e.stopPropagation()
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    openReminderModal(dateStr)
  }

  return (
    <div data-testid="calendar-panel" className="flex flex-col gap-1 px-2 pb-2">
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <button
          type="button"
          onClick={prevMonth}
          title={t('calendar.panel.previousMonth')}
          className="flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-slate-800 hover:text-slate-200 light:hover:bg-slate-200"
        >
          <ChevronLeft size={14} />
        </button>
        <span className="text-xs font-medium text-slate-300 light:text-slate-700">
          {t('calendar.panel.monthYear', { month: months[month], year })}
        </span>
        <button
          type="button"
          onClick={nextMonth}
          title={t('calendar.panel.nextMonth')}
          className="flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-slate-800 hover:text-slate-200 light:hover:bg-slate-200"
        >
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Day labels */}
      <div className="grid grid-cols-7 text-center">
        {dayLabels.map((label) => (
          <span key={label} className="text-[10px] font-medium text-slate-500">
            {label}
          </span>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-px">
        {days.map((day, idx) => {
          if (day === null) {
            return <div key={`empty-${viewMonth}-${idx}`} className="h-6" />
          }

          const isToday = isCurrentMonth && day === today.getDate()
          const hasNote = noteDays.has(day)
          const hasReminder = reminderDays.has(day)

          // The day and its hover "add reminder" action are sibling buttons in a
          // wrapper: a button nested in a button is invalid HTML.
          return (
            <div
              key={`day-${day}`}
              data-day={day}
              data-has-note={hasNote || undefined}
              data-has-reminder={hasReminder || undefined}
              className="group relative"
            >
              <button
                type="button"
                onClick={() => handleDayClick(day)}
                className={`relative flex h-6 w-full items-center justify-center rounded text-[11px] transition-colors ${
                  isToday
                    ? 'bg-accent-600/20 font-bold text-accent-400 ring-1 ring-accent-500/50'
                    : 'text-slate-300 hover:bg-slate-800 light:text-slate-700 light:hover:bg-slate-200'
                }`}
              >
                {day}
                {/* Indicators */}
                <span className="absolute bottom-0.5 left-1/2 flex -translate-x-1/2 gap-px">
                  {hasNote && <span className="inline-block h-1 w-1 rounded-full bg-accent-500" />}
                  {hasReminder && (
                    <span className="inline-block h-1 w-1 rounded-full bg-amber-400" />
                  )}
                </span>
              </button>
              {/* Add reminder on hover */}
              <button
                type="button"
                onClick={(e) => handleReminderClick(e, day)}
                className="absolute -right-0.5 -top-0.5 hidden rounded-full bg-slate-700 p-px text-slate-400 group-hover:inline-flex light:bg-slate-300 light:text-slate-600"
                title={t('calendar.panel.addReminderOnDay')}
              >
                <Plus size={8} />
              </button>
            </div>
          )
        })}
      </div>

      {/* Quick add reminder button */}
      <button
        type="button"
        onClick={() => openReminderModal()}
        className="mt-1 flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-200 light:hover:bg-slate-200 light:hover:text-slate-700"
      >
        <Bell size={12} />
        <span>{t('calendar.panel.newReminder')}</span>
      </button>

      {/* Upcoming reminders */}
      {upcoming.length > 0 && (
        <ul className="max-h-32 overflow-y-auto" aria-label={t('calendar.panel.remindersList')}>
          {upcoming.map((r) => (
            <li
              key={r.id}
              className="group flex items-center gap-1.5 rounded-md px-2 py-1 text-xs hover:bg-slate-800 light:hover:bg-slate-200"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-slate-300 light:text-slate-700">
                  {r.title}
                </span>
                <span className="block truncate text-[10px] text-slate-500">
                  {formatFireAt(r.fireAt, localeTag(language))}
                </span>
              </span>
              {r.recurrence !== 'none' && (
                <Repeat size={11} className="shrink-0 text-slate-500" aria-hidden="true" />
              )}
              <button
                type="button"
                onClick={() => setPendingDelete(r)}
                title={t('calendar.panel.deleteReminder')}
                className="invisible shrink-0 rounded p-1 text-slate-500 transition hover:bg-slate-700 hover:text-red-400 focus:visible group-hover:visible light:hover:bg-slate-300"
              >
                <Trash2 className="size-3" aria-hidden="true" />
                <span className="sr-only">{t('calendar.panel.deleteReminder')}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title={t('calendar.panel.deleteTitle')}
        message={t('calendar.panel.deleteMessage', { title: pendingDelete?.title ?? '' })}
        confirmLabel={t('calendar.panel.deleteConfirm')}
        onConfirm={() => {
          if (pendingDelete) void removeReminder(pendingDelete.id)
          setPendingDelete(null)
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}

function formatFireAt(iso: string, locale: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
