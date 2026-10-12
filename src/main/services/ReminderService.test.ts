import type { ReminderFiredPayload, ReminderRecord } from '@shared/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const shown: string[] = []

vi.mock('electron', () => {
  class Notification {
    private body: string
    constructor(opts: { body: string }) {
      this.body = opts.body
    }
    on(): this {
      return this
    }
    show(): void {
      shown.push(this.body)
    }
  }
  return {
    Notification,
    app: { isPackaged: false },
    powerMonitor: { on: vi.fn(), removeListener: vi.fn() },
  }
})

import { MAX_CHECK_INTERVAL_MS, ReminderService } from './ReminderService'
import type { SettingsService } from './SettingsService'

const DAY = 24 * 60 * 60_000

/** In-memory stand-in for the reminder slice of SettingsService. */
function fakeSettings(initial: ReminderRecord[]) {
  let reminders = [...initial]
  const api = {
    getReminders: async () => reminders,
    addReminder: async (r: ReminderRecord) => {
      reminders = [...reminders, r]
    },
    removeReminder: async (id: string) => {
      reminders = reminders.filter((r) => r.id !== id)
    },
    markReminderFired: async (id: string) => {
      reminders = reminders.map((r) => (r.id === id ? { ...r, fired: true } : r))
    },
    updateReminder: async (u: ReminderRecord) => {
      reminders = reminders.map((r) => (r.id === u.id ? u : r))
    },
  }
  return { settings: api as unknown as SettingsService, all: () => reminders }
}

function reminder(over: Partial<ReminderRecord>): ReminderRecord {
  return {
    id: 'r1',
    title: 'Test',
    notePath: null,
    fireAt: new Date().toISOString(),
    alertBefore: 0,
    recurrence: 'none',
    fired: false,
    createdAt: 0,
    ...over,
  }
}

function makeService(settings: SettingsService, fired: ReminderFiredPayload[]) {
  return new ReminderService({
    settings,
    onFire: (p) => fired.push(p),
    getMainWindow: () => null,
  })
}

describe('ReminderService', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-10T09:00:00Z'))
    shown.length = 0
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('fires a reminder further out than the 2^31-1 ms setTimeout limit', async () => {
    const fireAt = new Date(Date.now() + 40 * DAY).toISOString()
    const { settings, all } = fakeSettings([reminder({ fireAt })])
    const svc = makeService(settings, [])
    await svc.init()
    expect(shown).toEqual([])

    await vi.advanceTimersByTimeAsync(40 * DAY - MAX_CHECK_INTERVAL_MS)
    expect(shown).toEqual([])

    await vi.advanceTimersByTimeAsync(MAX_CHECK_INTERVAL_MS)
    expect(shown).toEqual(['Test'])
    expect(all()[0]?.fired).toBe(true)
    svc.dispose()
  })

  it('fires a missed recurring reminder once and moves it to the next future occurrence', async () => {
    const fireAt = new Date(Date.now() - 10 * DAY - 60_000).toISOString()
    const { settings, all } = fakeSettings([reminder({ fireAt, recurrence: 'daily' })])
    const svc = makeService(settings, [])
    await svc.init()

    expect(shown).toEqual(['Test'])
    const next = new Date(all()[0]?.fireAt ?? '').getTime()
    expect(next).toBeGreaterThan(Date.now())
    expect(next - Date.now()).toBeLessThanOrEqual(DAY)
    expect(all()[0]?.fired).toBe(false)

    // Next day's occurrence fires exactly once more.
    await vi.advanceTimersByTimeAsync(DAY)
    expect(shown).toEqual(['Test', 'Test'])
    svc.dispose()
  })

  it('treats an unknown recurrence as a one-off', async () => {
    const fireAt = new Date(Date.now() - 60_000).toISOString()
    const r = reminder({ fireAt, recurrence: 'yearly' as ReminderRecord['recurrence'] })
    const { settings, all } = fakeSettings([r])
    const svc = makeService(settings, [])
    await svc.init()
    await vi.advanceTimersByTimeAsync(3 * DAY)

    expect(shown).toEqual(['Test'])
    expect(all()[0]?.fired).toBe(true)
    svc.dispose()
  })

  it('buffers fired events until the renderer pulls them', async () => {
    const fireAt = new Date(Date.now() - 60_000).toISOString()
    const { settings } = fakeSettings([
      reminder({ id: 'a', fireAt }),
      reminder({ id: 'b', fireAt }),
    ])
    const fired: ReminderFiredPayload[] = []
    const svc = makeService(settings, fired)
    await svc.init()

    expect(fired).toEqual([])
    expect(svc.takePending().map((p) => p.id)).toEqual(['a', 'b'])
    expect(svc.takePending()).toEqual([])
    svc.dispose()
  })
})
