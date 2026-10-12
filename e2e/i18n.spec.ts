import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ElectronApplication, Page } from './fixtures'
import { expect, test } from './fixtures'
import { noteButton, openSettings, sidebar, waitForWindow } from './support/ui'

async function settingsJson(userDataDir: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(join(userDataDir, 'settings.json'), 'utf-8'))
}

/** Tray strings from the main-process dictionary (the tray itself is skipped under E2E). */
async function trayLabels(app: ElectronApplication): Promise<string[]> {
  return app.evaluate(() =>
    (
      globalThis as unknown as { __slateE2E: { trayLabels: () => string[] } }
    ).__slateE2E.trayLabels(),
  )
}

/** Top-level labels of the installed application menu. */
async function menuLabels(app: ElectronApplication): Promise<string[]> {
  return app.evaluate(({ Menu }) => Menu.getApplicationMenu()?.items.map((i) => i.label) ?? [])
}

/** The sidebar in either language (its accessible name is translated too). */
const aside = (p: Page) => p.getByRole('complementary')

async function pinSticky(page: Page, app: ElectronApplication, label: string): Promise<Page> {
  await noteButton(page, label).hover()
  await sidebar(page)
    .getByRole('button', { name: `Pin ${label} as sticky` })
    .click()
  const sticky = await waitForWindow(app, '#/sticky/')
  await expect(sticky.locator('.cm-content')).toBeVisible()
  return sticky
}

test('switching to Türkçe translates every window, the tray and the menu, and persists', async ({
  slate,
  page,
}) => {
  const sticky = await pinSticky(page, slate.app, 'Welcome')
  await expect(sticky.getByRole('button', { name: 'Close sticky' })).toBeVisible()
  expect(await trayLabels(slate.app)).toContain('Open Slate')
  expect(await menuLabels(slate.app)).toContain('Edit')

  await openSettings(page)
  await expect(aside(page).getByRole('heading', { name: 'Language / Dil' })).toBeVisible()
  await aside(page).getByRole('button', { name: 'Türkçe', exact: true }).click()

  // Main window re-renders live.
  await expect(aside(page).getByRole('heading', { name: 'Ayarlar' })).toBeVisible()
  await expect(aside(page).getByRole('button', { name: 'Türkçe', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.locator('html')).toHaveAttribute('lang', 'tr')
  // The already-open sticky window follows the broadcast.
  await expect(sticky.getByRole('button', { name: 'Yapışkan notu kapat' })).toBeVisible()
  await expect(sticky.locator('html')).toHaveAttribute('lang', 'tr')
  // Main-process strings: tray labels and the rebuilt app menu.
  await expect.poll(() => trayLabels(slate.app)).toEqual(['Slate', "Slate'i Aç", "Slate'ten Çık"])
  await expect.poll(() => menuLabels(slate.app)).toContain('Düzen')
  await expect.poll(async () => (await settingsJson(slate.userDataDir)).language).toBe('tr')

  await aside(page).getByRole('button', { name: 'Kapat', exact: true }).click()
  await expect(aside(page).getByRole('button', { name: 'Yeni not', exact: true })).toBeVisible()

  // Unpin (keeps the restart's first window the main one), then restart: it persists.
  await sticky.getByRole('button', { name: 'Yapışkan notu kapat' }).click()
  await expect.poll(async () => (await settingsJson(slate.userDataDir)).stickies).toEqual([])
  const page2 = await slate.restart()
  await expect(aside(page2).getByRole('button', { name: 'Yeni not', exact: true })).toBeVisible()
  await expect(aside(page2).getByRole('button', { name: 'Ayarlar', exact: true })).toBeVisible()
  expect(await trayLabels(slate.app)).toContain("Slate'i Aç")
  expect(await menuLabels(slate.app)).toContain('Düzen')

  // And back to English.
  await aside(page2).getByRole('button', { name: 'Ayarlar', exact: true }).click()
  await aside(page2).getByRole('button', { name: 'English', exact: true }).click()
  await expect(aside(page2).getByRole('heading', { name: 'Settings' })).toBeVisible()
  await expect(page2.locator('html')).toHaveAttribute('lang', 'en')
  await expect.poll(() => trayLabels(slate.app)).toContain('Open Slate')
  await expect.poll(() => menuLabels(slate.app)).toContain('Edit')
  await expect.poll(async () => (await settingsJson(slate.userDataDir)).language).toBe('en')
})

test.describe('first run without a saved language', () => {
  // Unset language: main falls back to the OS locale (whatever this machine reports).
  test.use({ settings: { language: null } })

  test('follows the OS locale', async ({ slate, page }) => {
    const expected = await slate.app.evaluate(({ app }) =>
      /^tr(?:[-_]|$)/i.test(app.getLocale()) ? 'tr' : 'en',
    )
    await expect(page.locator('html')).toHaveAttribute('lang', expected)
  })
})
