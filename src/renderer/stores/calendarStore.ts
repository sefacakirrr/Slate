import { api } from '@renderer/api'
import type { ReminderFiredPayload, ReminderRecord, ReminderRecurrence } from '@shared/types'
import { create } from 'zustand'

function todayMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

type CalendarState = {
  viewMonth: string
  daysWithNotes: string[]
  reminders: ReminderRecord[]
  calendarOpen: boolean
  reminderModalOpen: boolean
  reminderModalDate: string | null
  lastFired: ReminderFiredPayload | null

  setViewMonth: (month: string) => void
  loadMonthNotes: (month: string) => Promise<void>
  loadReminders: () => Promise<void>
  addReminder: (req: {
    title: string
    notePath: string | null
    fireAt: string
    alertBefore: number
    recurrence: ReminderRecurrence
  }) => Promise<void>
  removeReminder: (id: string) => Promise<void>
  openDailyNote: (date: string) => Promise<string | null>
  toggleCalendar: () => void
  openReminderModal: (date?: string) => void
  closeReminderModal: () => void
  dismissFired: () => void
  setLastFired: (payload: ReminderFiredPayload) => void
}

export const useCalendarStore = create<CalendarState>((set, get) => ({
  viewMonth: todayMonth(),
  daysWithNotes: [],
  reminders: [],
  calendarOpen: false,
  reminderModalOpen: false,
  reminderModalDate: null,
  lastFired: null,

  setViewMonth: (month) => {
    set({ viewMonth: month })
    void get().loadMonthNotes(month)
  },

  loadMonthNotes: async (month) => {
    const result = await api.dailynotes.list(month)
    if (result.ok) set({ daysWithNotes: result.data })
  },

  loadReminders: async () => {
    const result = await api.reminder.list()
    if (result.ok) set({ reminders: result.data })
  },

  addReminder: async (req) => {
    const result = await api.reminder.add(req)
    if (result.ok) {
      set((s) => ({ reminders: [...s.reminders, result.data] }))
    }
  },

  removeReminder: async (id) => {
    const result = await api.reminder.remove(id)
    if (result.ok) {
      set((s) => ({ reminders: s.reminders.filter((r) => r.id !== id) }))
    }
  },

  openDailyNote: async (date) => {
    const result = await api.dailynotes.open(date)
    if (!result.ok) return null
    // A new daily note must show its dot without waiting for a month change.
    void get().loadMonthNotes(get().viewMonth)
    return result.data
  },

  toggleCalendar: () => set((s) => ({ calendarOpen: !s.calendarOpen })),

  openReminderModal: (date) => set({ reminderModalOpen: true, reminderModalDate: date ?? null }),
  closeReminderModal: () => set({ reminderModalOpen: false, reminderModalDate: null }),

  dismissFired: () => set({ lastFired: null }),
  setLastFired: (payload) => set({ lastFired: payload }),
}))
