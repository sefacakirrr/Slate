import type { ReminderFiredPayload, ReminderRecord } from '@shared/types'
import { type BrowserWindow, Notification, powerMonitor } from 'electron'
import { getAppIconPath } from '../appIcon'
import { tm } from '../i18n'
import type { SettingsService } from './SettingsService'

/**
 * Longest single sleep between checks. One timer per due time is fragile: a
 * setTimeout does not advance while the machine sleeps, ignores wall-clock
 * changes, and cannot exceed 2^31-1 ms (~24.8 days). Re-checking at least this
 * often bounds the lateness from any of those to a few minutes; powerMonitor
 * resume/unlock re-checks immediately.
 */
export const MAX_CHECK_INTERVAL_MS = 5 * 60_000

/** Cap on fired events held for a renderer that has not subscribed yet. */
const MAX_PENDING = 50

const KNOWN_RECURRENCES = new Set(['daily', 'weekly', 'monthly'])

function isRecurring(r: ReminderRecord): boolean {
  return KNOWN_RECURRENCES.has(r.recurrence)
}

/** Epoch ms at which a reminder should alert (fireAt minus its lead time). */
function effectiveTime(r: Pick<ReminderRecord, 'fireAt' | 'alertBefore'>): number {
  return new Date(r.fireAt).getTime() - (r.alertBefore ?? 0) * 60_000
}

/** Days in a (local-calendar) month; `month` is 0-based and may overflow into the next year. */
function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

/**
 * The day-of-month a monthly reminder recurs on: the stored anchor, else the
 * local day of `fireAt` (records created before anchors existed).
 */
export function monthlyAnchorDay(r: Pick<ReminderRecord, 'fireAt' | 'anchorDay'>): number {
  return r.anchorDay ?? new Date(r.fireAt).getDate()
}

/**
 * One recurrence step after `fireAt`. Unknown recurrences return `fireAt` unchanged.
 * Steps are in local calendar time, so the wall-clock time survives DST changes.
 * Monthly: lands on `anchorDay` (default: `fireAt`'s day) clamped to the target
 * month's length — Jan 31 → Feb 28/29 → Mar 31 → Apr 30, never rolling over.
 */
export function computeNextFireAt(
  fireAt: string,
  recurrence: ReminderRecord['recurrence'],
  anchorDay?: number,
): string {
  const d = new Date(fireAt)
  if (Number.isNaN(d.getTime())) return fireAt
  switch (recurrence) {
    case 'daily':
      d.setDate(d.getDate() + 1)
      break
    case 'weekly':
      d.setDate(d.getDate() + 7)
      break
    case 'monthly': {
      const anchor = anchorDay ?? d.getDate()
      const year = d.getFullYear()
      const month = d.getMonth() + 1
      // Day 1 first so setFullYear can't overflow out of the target month.
      d.setFullYear(year, month, 1)
      d.setDate(Math.min(anchor, daysInMonth(year, month)))
      break
    }
    default:
      return fireAt
  }
  return d.toISOString()
}

/**
 * Advances a recurring reminder past `now`: the first occurrence whose alert time
 * is in the future. A reminder missed for weeks lands on the next upcoming
 * occurrence rather than replaying each missed one.
 */
export function nextFutureFireAt(r: ReminderRecord, now: number): string {
  let fireAt = r.fireAt
  const anchor = r.recurrence === 'monthly' ? monthlyAnchorDay(r) : undefined
  // Bounded loop: guards against an invalid date producing NaN forever.
  for (let i = 0; i < 100_000; i++) {
    const next = computeNextFireAt(fireAt, r.recurrence, anchor)
    if (next === fireAt) return fireAt
    fireAt = next
    if (effectiveTime({ fireAt, alertBefore: r.alertBefore }) > now) return fireAt
  }
  return fireAt
}

type ReminderServiceDeps = {
  settings: SettingsService
  /** Delivers a fired event to the main window's renderer. */
  onFire: (payload: ReminderFiredPayload) => void
  getMainWindow: () => BrowserWindow | null
  /** Shows (recreating if needed) the main window; used by notification clicks. */
  showMainWindow?: () => BrowserWindow | null
}

export class ReminderService {
  private settings: SettingsService
  private onFire: (payload: ReminderFiredPayload) => void
  private getMainWindow: () => BrowserWindow | null
  private showMainWindow: (() => BrowserWindow | null) | undefined
  private timer: NodeJS.Timeout | null = null
  /** Serializes every settings read-modify-write done by this service. */
  private queue: Promise<unknown> = Promise.resolve()
  /**
   * Strong refs so notification click handlers are not garbage-collected, with
   * each one's payload (kept current by `remapPaths`, so a click after a rename
   * opens the note at its new path).
   */
  private notifications = new Map<Notification, ReminderFiredPayload>()
  /** Fired events not yet delivered because the renderer had not subscribed. */
  private pending: ReminderFiredPayload[] = []
  /** webContents id of the main-window renderer that pulled pending events. */
  private readyContentsId: number | null = null
  private disposed = false
  private readonly recheck = () => this.check()

  constructor(deps: ReminderServiceDeps) {
    this.settings = deps.settings
    this.onFire = deps.onFire
    this.getMainWindow = deps.getMainWindow
    this.showMainWindow = deps.showMainWindow
  }

  /** Fires overdue reminders and arms the scheduler. Call after app ready. */
  async init(): Promise<void> {
    powerMonitor.on('resume', this.recheck)
    powerMonitor.on('unlock-screen', this.recheck)
    await this.check()
  }

  async add(reminder: ReminderRecord): Promise<void> {
    await this.enqueue(() => this.settings.addReminder(reminder))
    await this.check()
  }

  async remove(id: string): Promise<void> {
    await this.enqueue(() => this.settings.removeReminder(id))
    await this.check()
  }

  async list(): Promise<ReminderRecord[]> {
    return this.enqueue(() => this.settings.getReminders())
  }

  /**
   * A note or folder moved: rewrites every `notePath` the mapper changes — in
   * persisted reminders, events buffered for the renderer, and shown
   * notifications. The settings write runs on the serialized queue.
   */
  remapPaths(map: (path: string) => string | null): Promise<void> {
    const next = (p: string | null): string | null => (p === null ? null : (map(p) ?? p))
    // Inside the queue, so a fire already in flight is remapped too.
    return this.enqueue(async () => {
      this.pending = this.pending.map((e) => ({ ...e, notePath: next(e.notePath) }))
      for (const [n, e] of this.notifications) {
        this.notifications.set(n, { ...e, notePath: next(e.notePath) })
      }
      const reminders = await this.settings.getReminders()
      let changed = false
      const updated = reminders.map((r) => {
        const notePath = next(r.notePath)
        if (notePath === r.notePath) return r
        changed = true
        return { ...r, notePath }
      })
      if (changed) await this.settings.setReminders(updated)
    })
  }

  /**
   * Called by the main-window renderer once it subscribes to fired events.
   * Returns the events it missed and marks it ready for live delivery.
   */
  takePending(): ReminderFiredPayload[] {
    const win = this.getMainWindow()
    this.readyContentsId = win && !win.isDestroyed() ? win.webContents.id : null
    return this.pending.splice(0)
  }

  /** Fires everything due, then re-arms the timer. Safe to call any time. */
  check(): Promise<void> {
    return this.enqueue(async () => {
      if (this.disposed) return
      const reminders = await this.settings.getReminders()
      const now = Date.now()
      for (const r of reminders) {
        const t = effectiveTime(r)
        if (r.fired || Number.isNaN(t) || t > now) continue
        await this.fire(r, now)
      }
      this.arm(await this.settings.getReminders())
    }).catch((err) => console.error('reminder check failed:', err))
  }

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn)
    this.queue = run.catch(() => {})
    return run
  }

  private arm(reminders: ReminderRecord[]): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    if (this.disposed) return
    let next = Number.POSITIVE_INFINITY
    for (const r of reminders) {
      if (r.fired) continue
      const t = effectiveTime(r)
      if (!Number.isNaN(t) && t < next) next = t
    }
    if (next === Number.POSITIVE_INFINITY) return
    const delay = Math.min(Math.max(next - Date.now(), 0), MAX_CHECK_INTERVAL_MS)
    this.timer = setTimeout(this.recheck, delay)
  }

  private async fire(r: ReminderRecord, now: number): Promise<void> {
    const payload: ReminderFiredPayload = { id: r.id, title: r.title, notePath: r.notePath }
    this.notify(payload)

    if (isRecurring(r)) {
      const fireAt = nextFutureFireAt(r, now)
      // Persist the monthly anchor before fireAt moves to a clamped day (Feb 28
      // must still recur on the 31st later).
      const anchor = r.recurrence === 'monthly' ? { anchorDay: monthlyAnchorDay(r) } : {}
      await this.settings.updateReminder({ ...r, ...anchor, fireAt })
    } else {
      // 'none' and any unknown recurrence value are one-offs.
      await this.settings.markReminderFired(r.id)
    }
    this.dispatch(payload)
  }

  private notify(payload: ReminderFiredPayload): void {
    let notification: Notification
    try {
      notification = new Notification({
        title: tm('notification.reminderTitle'),
        body: payload.title,
        icon: getAppIconPath('png'),
        silent: false,
      })
    } catch (err) {
      console.error('reminder notification failed:', err)
      return
    }
    this.notifications.set(notification, payload)
    const release = () => this.notifications.delete(notification)

    notification.on('click', () => {
      const current = this.notifications.get(notification) ?? payload
      release()
      const win = this.showMainWindow ? this.showMainWindow() : this.getMainWindow()
      if (win && !win.isDestroyed()) {
        if (win.isMinimized()) win.restore()
        win.show()
        win.focus()
        win.webContents.send('reminder:navigate', current)
      }
    })
    notification.on('close', release)
    notification.on('failed', release)
    notification.show()
  }

  /** Sends live if the renderer is subscribed, else buffers for takePending(). */
  private dispatch(payload: ReminderFiredPayload): void {
    const win = this.getMainWindow()
    if (
      win &&
      !win.isDestroyed() &&
      this.readyContentsId !== null &&
      win.webContents.id === this.readyContentsId
    ) {
      this.onFire(payload)
      return
    }
    this.pending.push(payload)
    if (this.pending.length > MAX_PENDING) this.pending.shift()
  }

  dispose(): void {
    this.disposed = true
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    powerMonitor.removeListener('resume', this.recheck)
    powerMonitor.removeListener('unlock-screen', this.recheck)
    this.notifications.clear()
  }
}
