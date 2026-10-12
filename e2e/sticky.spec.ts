import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ElectronApplication, Page } from './fixtures'
import { expect, test } from './fixtures'
import { editor, noteButton, openSettings, sidebar, trashToast, waitForWindow } from './support/ui'

async function pinSticky(page: Page, app: ElectronApplication, label: string): Promise<Page> {
  await noteButton(page, label).hover()
  await sidebar(page)
    .getByRole('button', { name: `Pin ${label} as sticky` })
    .click()
  const sticky = await waitForWindow(app, '#/sticky/')
  await expect(sticky.locator('.cm-content')).toBeVisible()
  return sticky
}

async function stickyCount(app: ElectronApplication): Promise<number> {
  return app.evaluate(
    ({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().filter(
        (w) =>
          !w.isDestroyed() &&
          !w.webContents.isDestroyed() &&
          w.webContents.getURL().includes('#/sticky/'),
      ).length,
  )
}

async function storedStickies(userDataDir: string): Promise<{ path: string }[]> {
  const json = JSON.parse(await readFile(join(userDataDir, 'settings.json'), 'utf-8'))
  return json.stickies ?? []
}

const stickyBg = (sticky: Page) =>
  sticky.locator('.cm-editor').evaluate((el) => getComputedStyle(el).backgroundColor)

test('a pinned sticky edits the note and stays in sync with the main window', async ({
  slate,
  page,
  vault,
}) => {
  await noteButton(page, 'Welcome').click()
  const sticky = await pinSticky(page, slate.app, 'Welcome')
  await expect(sticky.locator('.cm-content')).toContainText('Seeded by the E2E fixture')

  await sticky.locator('.cm-content').click()
  await sticky.keyboard.press('Control+End')
  await sticky.keyboard.type(' from sticky')
  // Sticky autosave (~0.8s) writes the vault file; the clean main tab reloads.
  await expect.poll(() => vault.read('Welcome.md')).toContain('from sticky')
  await expect(editor(page)).toContainText('from sticky')

  // And the other way round: a save in the main window reaches the sticky.
  await editor(page).click()
  await page.keyboard.press('Control+End')
  await page.keyboard.type(' from main')
  await page.keyboard.press('Control+S')
  await expect(sticky.locator('.cm-content')).toContainText('from main')
})

test('stickies use the editor colour theme and font size (#9)', async ({ slate, page }) => {
  await openSettings(page)
  await sidebar(page).getByRole('button', { name: 'Light', exact: true }).click()
  await sidebar(page).getByRole('slider').fill('18')
  await sidebar(page).getByRole('button', { name: 'Close' }).click()

  const sticky = await pinSticky(page, slate.app, 'Welcome')
  await expect.poll(() => stickyBg(sticky)).toBe('rgb(255, 255, 255)')
  await expect(sticky.locator('.cm-editor')).toHaveCSS('font-size', '18px')

  // A colour theme picked in the main window reaches the open sticky.
  await openSettings(page)
  await sidebar(page).getByRole('button', { name: 'Dracula' }).click()
  await expect.poll(() => stickyBg(sticky)).toBe('rgb(40, 42, 54)')
})

test('stickies restore on relaunch with their geometry; closing one unpins it', async ({
  slate,
  page,
}) => {
  await pinSticky(page, slate.app, 'Welcome')
  await slate.app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((x) =>
      x.webContents.getURL().includes('#/sticky/'),
    )
    w?.setBounds({ x: 100, y: 120, width: 360, height: 300 })
  })
  await expect
    .poll(async () => (await storedStickies(slate.userDataDir))[0])
    .toMatchObject({ path: 'Welcome.md', bounds: { x: 100, y: 120, width: 360, height: 300 } })

  await slate.restart()
  const sticky = await waitForWindow(slate.app, '#/sticky/')
  await expect(sticky.locator('.cm-content')).toContainText('Seeded by the E2E fixture')
  const bounds = await slate.app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((x) => x.webContents.getURL().includes('#/sticky/'))
      ?.getBounds(),
  )
  expect(bounds).toMatchObject({ x: 100, y: 120, width: 360, height: 300 })

  await sticky.getByRole('button', { name: 'Close sticky' }).click()
  await expect.poll(() => stickyCount(slate.app)).toBe(0)
  await expect.poll(() => storedStickies(slate.userDataDir)).toEqual([])
})

test.describe('deleting the note', () => {
  test.use({
    vaultFiles: { 'Welcome.md': '# Welcome\n', '{run}-doomed.md': 'doomed note\n' },
  })

  test('edits typed in a sticky survive the note being deleted from the main window (#20)', async ({
    slate,
    page,
    vault,
    recycleBin,
  }) => {
    const label = slate.uid('doomed')
    const file = `${label}.md`
    const sticky = await pinSticky(page, slate.app, label)
    await sticky.locator('.cm-content').click()
    await sticky.keyboard.press('Control+End')
    await sticky.keyboard.type(' last words')
    // The user clicks the main window right away (before the autosave debounce).
    await slate.app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()
        .find((x) => !x.webContents.getURL().includes('#/'))
        ?.focus()
    })
    await noteButton(page, label).hover()
    await sidebar(page)
      .getByRole('button', { name: `Delete ${label}`, exact: true })
      .click()
    await page
      .getByRole('dialog', { name: 'Delete note' })
      .getByRole('button', { name: 'Delete', exact: true })
      .click()

    // The sticky closes with its note …
    await expect.poll(() => stickyCount(slate.app)).toBe(0)
    // … and Undo brings the note back including what was typed in the sticky.
    await trashToast(page).getByRole('button', { name: 'Undo' }).click()
    await expect.poll(() => vault.exists(file)).toBe(true)
    expect(await vault.read(file)).toContain('last words')
    await recycleBin.waitFor(file)
  })
})
