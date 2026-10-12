import type { ElectronApplication, Locator, Page } from './fixtures'
import { expect, test } from './fixtures'
import { editor, noteButton, sidebar } from './support/ui'

const pad = (n: number) => String(n).padStart(2, '0')
const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

async function openCalendar(page: Page): Promise<Locator> {
  await sidebar(page).getByRole('button', { name: 'Calendar', exact: true }).click()
  const panel = sidebar(page).getByTestId('calendar-panel')
  await expect(panel).toBeVisible()
  return panel
}

function dayCell(panel: Locator, day: number): Locator {
  return panel.locator(`[data-day="${day}"]`)
}

/** Fills and submits the reminder modal. `date`/`time` default to what the modal proposes. */
async function createReminder(
  page: Page,
  opts: { title: string; date?: string; time?: string; recurrence?: string; linkNote?: boolean },
): Promise<void> {
  const modal = page.locator('form').filter({ hasText: 'Create reminder' })
  await expect(modal).toBeVisible()
  await modal.getByLabel('Title', { exact: true }).fill(opts.title)
  if (opts.date) await modal.getByLabel('Date', { exact: true }).fill(opts.date)
  if (opts.time) await modal.getByLabel('Time', { exact: true }).fill(opts.time)
  if (opts.recurrence) await modal.locator('select').nth(1).selectOption({ label: opts.recurrence })
  if (opts.linkNote) await modal.getByRole('checkbox').check()
  await modal.getByRole('button', { name: 'Create reminder' }).click()
  await expect(modal).toBeHidden()
}

/** Replaces OS notifications with recorders so specs can "click" them without desktop toasts. */
async function captureNotifications(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ Notification }) => {
    const g = globalThis as unknown as { __shown: Electron.Notification[] }
    g.__shown = []
    Notification.prototype.show = function show(this: Electron.Notification) {
      g.__shown.push(this)
    }
  })
}

function reminderToast(page: Page, title: string): Locator {
  return page.getByRole('button', { name: new RegExp(`Reminder.*${title}`) })
}

async function storedReminders(
  app: ElectronApplication,
): Promise<{ title: string; fired: boolean; fireAt: string }[]> {
  return app.evaluate(async ({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    return win.webContents.executeJavaScript(
      'window.api.reminder.list().then((r) => (r.ok ? r.data : []))',
    )
  })
}

test('calendar day cells are not nested buttons (#16)', async ({ page }) => {
  const panel = await openCalendar(page)
  await expect(dayCell(panel, 1)).toBeVisible()
  await expect(panel.locator('button button')).toHaveCount(0)
  // Each day still offers the hover "Add reminder" action.
  await dayCell(panel, 3).hover()
  await panel.getByRole('button', { name: 'Add reminder' }).first().click()
  const now = new Date()
  await expect(page.getByLabel('Date', { exact: true })).toHaveValue(
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-03`,
  )
  await page.keyboard.press('Escape')
})

test('opening a daily note marks its day immediately (#17)', async ({ page, vault }) => {
  const panel = await openCalendar(page)
  const cell = dayCell(panel, 5)
  await expect(cell).not.toHaveAttribute('data-has-note', 'true')
  await cell.getByRole('button').first().click()

  const now = new Date()
  const file = `daily/${now.getFullYear()}-${pad(now.getMonth() + 1)}-05.md`
  await expect.poll(() => vault.exists(file)).toBe(true)
  await expect(cell).toHaveAttribute('data-has-note', 'true')
  await expect(editor(page)).toBeVisible()
})

test('reminder modal proposes the local date shortly after midnight (#14)', async ({ page }) => {
  // 01:30 local is still "yesterday" in UTC for any zone east of UTC.
  const at = new Date(2026, 9, 12, 1, 30)
  await page.clock.setFixedTime(at)
  const panel = await openCalendar(page)
  await panel.getByRole('button', { name: 'New reminder' }).click()
  await expect(page.getByLabel('Date', { exact: true })).toHaveValue(localDate(at))
})

test('a reminder fires a toast and an OS notification that opens its note', async ({
  slate,
  page,
}) => {
  await captureNotifications(slate.app)
  await noteButton(page, 'Welcome').click()
  const panel = await openCalendar(page)
  await panel.getByRole('button', { name: 'New reminder' }).click()
  // Today 00:00 is already past: it fires as soon as it is saved.
  await createReminder(page, { title: 'Stand-up', time: '00:00', linkNote: true })

  const toast = reminderToast(page, 'Stand-up')
  await expect(toast).toBeVisible()
  await expect(toast).toContainText('Welcome.md')
  await expect
    .poll(() =>
      slate.app.evaluate(() => (globalThis as unknown as { __shown: unknown[] }).__shown.length),
    )
    .toBe(1)

  // Open another note, then click the OS notification: it navigates back.
  await noteButton(page, 'Plan').click()
  await expect(editor(page)).toContainText('first task')
  await slate.app.evaluate(() => {
    const n = (globalThis as unknown as { __shown: Electron.Notification[] }).__shown[0]
    n.emit('click')
  })
  await expect(editor(page)).toContainText('Seeded by the E2E fixture')

  // The toast also navigates.
  await noteButton(page, 'Plan').click()
  await toast.click()
  await expect(editor(page)).toContainText('Seeded by the E2E fixture')
  await expect(toast).toBeHidden()

  const stored = await storedReminders(slate.app)
  expect(stored).toHaveLength(1)
  expect(stored[0].fired).toBe(true)
})

test('a recurring reminder fires and moves to its next occurrence', async ({ slate, page }) => {
  await captureNotifications(slate.app)
  const panel = await openCalendar(page)
  await panel.getByRole('button', { name: 'New reminder' }).click()
  await createReminder(page, { title: 'Pills', time: '00:00', recurrence: 'Every day' })
  await expect(reminderToast(page, 'Pills')).toBeVisible()

  const [r] = await storedReminders(slate.app)
  expect(r.fired).toBe(false)
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  expect(localDate(new Date(r.fireAt))).toBe(localDate(tomorrow))
  // Still listed as upcoming.
  await expect(panel.getByRole('listitem').filter({ hasText: 'Pills' })).toBeVisible()
})

test.describe('missed while closed', () => {
  const past = new Date(Date.now() - 60 * 60_000).toISOString()
  test.use({
    settings: {
      reminders: [
        {
          id: 'missed-1',
          title: 'Missed one',
          notePath: null,
          fireAt: past,
          alertBefore: 0,
          recurrence: 'none',
          fired: false,
          createdAt: Date.now() - 2 * 60 * 60_000,
        },
      ],
    },
  })

  test('a reminder that came due while Slate was closed fires at launch', async ({
    slate,
    page,
  }) => {
    // Fired during startup, before the fixture's reload, so its toast went to
    // the first page load; the stored record shows it fired (and only once).
    await expect(page.getByRole('button', { name: 'New note', exact: true })).toBeVisible()
    await expect.poll(async () => (await storedReminders(slate.app))[0]?.fired).toBe(true)

    // Fired once only: a relaunch does not repeat it.
    const page2 = await slate.restart()
    await page2.waitForTimeout(1_500)
    await expect(reminderToast(page2, 'Missed one')).toBeHidden()
  })
})

test('upcoming reminders are listed and can be deleted (#15)', async ({ slate, page }) => {
  const panel = await openCalendar(page)
  const later = new Date()
  later.setDate(later.getDate() + 2)
  await panel.getByRole('button', { name: 'New reminder' }).click()
  await createReminder(page, { title: 'Dentist', date: localDate(later), time: '10:15' })

  const item = panel.getByRole('listitem').filter({ hasText: 'Dentist' })
  await expect(item).toBeVisible()
  if (later.getMonth() === new Date().getMonth()) {
    await expect(dayCell(panel, later.getDate())).toHaveAttribute('data-has-reminder', 'true')
  }

  await item.hover()
  await item.getByRole('button', { name: 'Delete reminder' }).click()
  const dialog = page.getByRole('dialog', { name: 'Delete reminder' })
  await expect(dialog).toContainText('Dentist')
  await dialog.getByRole('button', { name: 'Delete', exact: true }).click()

  await expect(item).toBeHidden()
  expect(await storedReminders(slate.app)).toHaveLength(0)
  if (later.getMonth() === new Date().getMonth()) {
    await expect(dayCell(panel, later.getDate())).not.toHaveAttribute('data-has-reminder', 'true')
  }
})
