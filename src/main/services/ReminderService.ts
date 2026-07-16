import { join } from 'node:path'
import { BrowserWindow, Notification, app } from 'electron'
import type { ReminderFiredPayload, ReminderRecord } from '@shared/types'
import type { SettingsService } from './SettingsService'

const MAX_TIMEOUT = 2_147_483_647 // ~24.8 days (2^31 - 1 ms)

function getAppIcon(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'icon.png')
  }
  return join(__dirname, '../../resources/icon.png')
}

function computeNextFireAt(fireAt: string, recurrence: ReminderRecord['recurrence']): string {
  const d = new Date(fireAt)
  switch (recurrence) {
    case 'daily':
      d.setDate(d.getDate() + 1)
      break
    case 'weekly':
      d.setDate(d.getDate() + 7)
      break
    case 'monthly':
      d.setMonth(d.getMonth() + 1)
      break
    default:
      return fireAt
  }
  return d.toISOString()
}

type ReminderServiceDeps = {
  settings: SettingsService
  onFire: (payload: ReminderFiredPayload) => void
  getMainWindow: () => BrowserWindow | null
}

export class ReminderService {
  private settings: SettingsService
  private timers = new Map<string, NodeJS.Timeout>()
  private onFire: (payload: ReminderFiredPayload) => void
  private getMainWindow: () => BrowserWindow | null

  constructor(deps: ReminderServiceDeps) {
    this.settings = deps.settings
    this.onFire = deps.onFire
    this.getMainWindow = deps.getMainWindow
  }

  async init(): Promise<void> {
    const reminders = await this.settings.getReminders()
    const now = Date.now()
    for (const r of reminders) {
      if (r.fired) continue
      const effectiveTime = new Date(r.fireAt).getTime() - r.alertBefore * 60_000
      if (effectiveTime <= now) {
        this.fireReminder(r)
      } else {
        this.scheduleReminder(r, effectiveTime)
      }
    }
  }

  async add(reminder: ReminderRecord): Promise<void> {
    await this.settings.addReminder(reminder)
    const effectiveTime = new Date(reminder.fireAt).getTime() - reminder.alertBefore * 60_000
    if (effectiveTime <= Date.now()) {
      this.fireReminder(reminder)
    } else {
      this.scheduleReminder(reminder, effectiveTime)
    }
  }

  async remove(id: string): Promise<void> {
    const timer = this.timers.get(id)
    if (timer) {
      clearTimeout(timer)
      this.timers.delete(id)
    }
    await this.settings.removeReminder(id)
  }

  async list(): Promise<ReminderRecord[]> {
    return this.settings.getReminders()
  }

  private scheduleReminder(r: ReminderRecord, effectiveTime: number): void {
    const delay = effectiveTime - Date.now()
    if (delay > MAX_TIMEOUT) return
    const timer = setTimeout(() => {
      this.timers.delete(r.id)
      this.fireReminder(r)
    }, Math.max(delay, 0))
    this.timers.set(r.id, timer)
  }

  private fireReminder(r: ReminderRecord): void {
    const payload: ReminderFiredPayload = { id: r.id, title: r.title, notePath: r.notePath }

    const notification = new Notification({
      title: 'Slate',
      body: r.title,
      icon: getAppIcon(),
      silent: false,
    })

    notification.on('click', () => {
      const win = this.getMainWindow()
      if (win && !win.isDestroyed()) {
        if (win.isMinimized()) win.restore()
        win.show()
        win.focus()
        win.webContents.send('reminder:navigate', payload)
      }
    })

    notification.show()

    if (r.recurrence !== 'none') {
      const nextFireAt = computeNextFireAt(r.fireAt, r.recurrence)
      const updated: ReminderRecord = { ...r, fireAt: nextFireAt }
      void this.settings.updateReminder(updated).then(() => this.onFire(payload))
      const effectiveTime = new Date(nextFireAt).getTime() - r.alertBefore * 60_000
      if (effectiveTime > Date.now()) {
        this.scheduleReminder(updated, effectiveTime)
      }
    } else {
      void this.settings.markReminderFired(r.id).then(() => this.onFire(payload))
    }
  }

  dispose(): void {
    for (const timer of this.timers.values()) clearTimeout(timer)
    this.timers.clear()
  }
}
