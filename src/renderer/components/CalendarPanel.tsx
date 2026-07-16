import { useCalendarStore } from '@renderer/stores/calendarStore'
import { useWorkspaceStore } from '@renderer/stores/workspaceStore'
import { Bell, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { useEffect, useMemo } from 'react'

function getCalendarDays(year: number, month: number): (number | null)[] {
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length < 42) cells.push(null)
  return cells
}

const MONTH_NAMES = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
]

const DAY_LABELS = ['Pz', 'Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct']

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
  } = useCalendarStore()
  const openTab = useWorkspaceStore((s) => s.openTab)

  const [year, month] = useMemo(() => {
    const [y, m] = viewMonth.split('-').map(Number)
    return [y, m - 1]
  }, [viewMonth])

  const days = useMemo(() => getCalendarDays(year, month), [year, month])

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
    <div className="flex flex-col gap-1 px-2 pb-2">
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <button
          type="button"
          onClick={prevMonth}
          className="flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-slate-800 hover:text-slate-200 light:hover:bg-slate-200"
        >
          <ChevronLeft size={14} />
        </button>
        <span className="text-xs font-medium text-slate-300 light:text-slate-700">
          {MONTH_NAMES[month]} {year}
        </span>
        <button
          type="button"
          onClick={nextMonth}
          className="flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-slate-800 hover:text-slate-200 light:hover:bg-slate-200"
        >
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Day labels */}
      <div className="grid grid-cols-7 text-center">
        {DAY_LABELS.map((label) => (
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

          return (
            <button
              key={`day-${day}`}
              type="button"
              onClick={() => handleDayClick(day)}
              className={`group relative flex h-6 items-center justify-center rounded text-[11px] transition-colors ${
                isToday
                  ? 'bg-accent-600/20 font-bold text-accent-400 ring-1 ring-accent-500/50'
                  : 'text-slate-300 hover:bg-slate-800 light:text-slate-700 light:hover:bg-slate-200'
              }`}
            >
              {day}
              {/* Indicators */}
              <span className="absolute bottom-0.5 left-1/2 flex -translate-x-1/2 gap-px">
                {hasNote && (
                  <span className="inline-block h-1 w-1 rounded-full bg-accent-500" />
                )}
                {hasReminder && (
                  <span className="inline-block h-1 w-1 rounded-full bg-amber-400" />
                )}
              </span>
              {/* Add reminder on hover */}
              <button
                type="button"
                onClick={(e) => handleReminderClick(e, day)}
                className="absolute -right-0.5 -top-0.5 hidden rounded-full bg-slate-700 p-px text-slate-400 group-hover:inline-flex light:bg-slate-300 light:text-slate-600"
                aria-label="Add reminder"
              >
                <Plus size={8} />
              </button>
            </button>
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
        <span>Hatırlatıcı Ekle</span>
      </button>
    </div>
  )
}
