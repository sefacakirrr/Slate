// A zone with DST, set before any Date is created so the transitions below are
// real. Every assertion uses local getters, so the tests also hold elsewhere.
process.env.TZ = 'Europe/Berlin'

import type { ReminderRecord } from '@shared/types'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  Notification: class {},
  app: { isPackaged: false },
  powerMonitor: { on: vi.fn(), removeListener: vi.fn() },
}))

import { computeNextFireAt, monthlyAnchorDay, nextFutureFireAt } from './ReminderService'

/** Local wall-clock datetime → ISO (what the reminder modal stores). */
const local = (y: number, m: number, d: number, h = 9, min = 30) =>
  new Date(y, m - 1, d, h, min).toISOString()

/** ISO → local `YYYY-MM-DD HH:MM`. */
function wall(iso: string): string {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** `n` monthly steps from `start`, carrying the start's day as the anchor. */
function monthlySeries(start: string, n: number): string[] {
  const anchor = monthlyAnchorDay({ fireAt: start })
  const out: string[] = []
  let cur = start
  for (let i = 0; i < n; i++) {
    cur = computeNextFireAt(cur, 'monthly', anchor)
    out.push(wall(cur))
  }
  return out
}

const hasDst =
  new Date(2025, 0, 15).getTimezoneOffset() !== new Date(2025, 6, 15).getTimezoneOffset()

describe('computeNextFireAt — monthly', () => {
  it('clamps the 31st to the last day of shorter months and returns to the 31st', () => {
    expect(monthlySeries(local(2025, 1, 31), 4)).toEqual([
      '2025-02-28 09:30',
      '2025-03-31 09:30',
      '2025-04-30 09:30',
      '2025-05-31 09:30',
    ])
  })

  it('lands on Feb 29 in a leap year and Feb 28 in the next', () => {
    expect(monthlySeries(local(2024, 1, 31), 2)).toEqual(['2024-02-29 09:30', '2024-03-31 09:30'])
    expect(monthlySeries(local(2024, 12, 29), 3)).toEqual([
      '2025-01-29 09:30',
      '2025-02-28 09:30',
      '2025-03-29 09:30',
    ])
    expect(monthlySeries(local(2027, 12, 30), 2)).toEqual(['2028-01-30 09:30', '2028-02-29 09:30'])
  })

  it('handles the 30th and the December → January year change', () => {
    expect(monthlySeries(local(2025, 11, 30), 3)).toEqual([
      '2025-12-30 09:30',
      '2026-01-30 09:30',
      '2026-02-28 09:30',
    ])
  })

  it('without an anchor, steps from the current day (legacy behaviour minus the rollover)', () => {
    expect(wall(computeNextFireAt(local(2025, 1, 31), 'monthly'))).toBe('2025-02-28 09:30')
    expect(wall(computeNextFireAt(local(2025, 2, 28), 'monthly'))).toBe('2025-03-28 09:30')
  })

  it('keeps days ≤ 28 unchanged', () => {
    expect(monthlySeries(local(2025, 1, 15), 2)).toEqual(['2025-02-15 09:30', '2025-03-15 09:30'])
  })

  it.skipIf(!hasDst)('keeps the local wall-clock time across DST changes', () => {
    // Berlin: DST starts 2025-03-30, ends 2025-10-26.
    expect(monthlySeries(local(2025, 2, 28, 8, 0), 1)).toEqual(['2025-03-28 08:00'])
    expect(monthlySeries(local(2025, 3, 15, 23, 30), 1)).toEqual(['2025-04-15 23:30'])
    expect(monthlySeries(local(2025, 10, 26, 8, 0), 1)).toEqual(['2025-11-26 08:00'])
  })
})

describe('computeNextFireAt — daily/weekly across DST', () => {
  it.skipIf(!hasDst)('keeps the wall-clock time over a transition', () => {
    expect(wall(computeNextFireAt(local(2025, 3, 29, 9, 0), 'daily'))).toBe('2025-03-30 09:00')
    expect(wall(computeNextFireAt(local(2025, 10, 22, 9, 0), 'weekly'))).toBe('2025-10-29 09:00')
  })

  it('returns fireAt unchanged for none and invalid dates', () => {
    expect(computeNextFireAt(local(2025, 1, 31), 'none')).toBe(local(2025, 1, 31))
    expect(computeNextFireAt('garbage', 'monthly')).toBe('garbage')
  })
})

describe('nextFutureFireAt — monthly anchor', () => {
  const base: ReminderRecord = {
    id: 'r',
    title: 't',
    notePath: null,
    fireAt: local(2025, 1, 31),
    alertBefore: 0,
    recurrence: 'monthly',
    fired: false,
    createdAt: 0,
  }

  it('skips missed months without losing the anchor day', () => {
    // Missed Feb and Mar: next is Apr 30, not Apr 28.
    const now = new Date(2025, 3, 1).getTime()
    expect(wall(nextFutureFireAt(base, now))).toBe('2025-04-30 09:30')
  })

  it('uses the stored anchor once fireAt sits on a clamped day', () => {
    const clamped = { ...base, fireAt: local(2025, 2, 28), anchorDay: 31 }
    const now = new Date(2025, 2, 1).getTime()
    expect(wall(nextFutureFireAt(clamped, now))).toBe('2025-03-31 09:30')
    expect(monthlyAnchorDay(clamped)).toBe(31)
  })
})
