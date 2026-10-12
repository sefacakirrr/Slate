import { spawn } from 'node:child_process'
import type { ElectronApplication, Page } from './fixtures'
import { expect, test } from './fixtures'
import { editor, noteButton, sidebar } from './support/ui'

const titleBar = (page: Page) => page.locator('div.h-9').first()

async function mainState(app: ElectronApplication) {
  return app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((x) => !x.webContents.getURL().includes('#/'))
    return w ? { min: w.isMinimized(), max: w.isMaximized(), visible: w.isVisible() } : null
  })
}

test('title bar minimize / maximize / restore track the real window state', async ({
  slate,
  page,
}) => {
  const bar = titleBar(page)
  await bar.getByRole('button', { name: 'Maximize' }).click()
  await expect.poll(async () => (await mainState(slate.app))?.max).toBe(true)
  await expect(bar.getByRole('button', { name: 'Restore' })).toBeVisible()

  await bar.getByRole('button', { name: 'Restore' }).click()
  await expect.poll(async () => (await mainState(slate.app))?.max).toBe(false)
  await expect(bar.getByRole('button', { name: 'Maximize' })).toBeVisible()

  // Maximized from outside the title bar (double-click caption, Win+Up).
  await slate.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].maximize())
  await expect(bar.getByRole('button', { name: 'Restore' })).toBeVisible()
  await slate.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].unmaximize())
  await expect(bar.getByRole('button', { name: 'Maximize' })).toBeVisible()

  await bar.getByRole('button', { name: 'Minimize' }).click()
  await expect.poll(async () => (await mainState(slate.app))?.min).toBe(true)
  await slate.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].restore())
})

test('tooltips show when hovering anywhere over a button, title bar included', async ({ page }) => {
  const tip = page.getByRole('tooltip')
  const bar = titleBar(page)
  for (const name of ['Minimize', 'Maximize', 'Close']) {
    const btn = bar.getByRole('button', { name })
    const box = await btn.boundingBox()
    if (!box) throw new Error(`no ${name}`)
    // Corners and centre (over the icon) of the 44×36 hit area.
    for (const [fx, fy] of [
      [0.08, 0.1],
      [0.5, 0.5],
      [0.92, 0.9],
    ]) {
      await page.mouse.move(box.x + box.width * fx, box.y + box.height * fy)
      await expect(tip).toHaveText(name)
      await page.mouse.move(600, 400)
      await expect(tip).toBeHidden()
    }
  }

  // A small sidebar icon button.
  const settings = sidebar(page).getByRole('button', { name: 'Settings', exact: true })
  const box = await settings.boundingBox()
  if (!box) throw new Error('no settings button')
  await page.mouse.move(box.x + 2, box.y + 2)
  await expect(tip).toHaveText('Settings')
  // The title is restored once the pointer leaves (accessible name intact).
  await page.mouse.move(600, 400)
  await expect(settings).toHaveAttribute('title', 'Settings')
})

test('Close with an unsaved note asks before quitting; Cancel keeps the app', async ({
  slate,
  page,
}) => {
  await sidebar(page).getByRole('button', { name: 'Settings', exact: true }).click()
  await sidebar(page).getByRole('switch', { name: 'Toggle auto-save' }).click()
  await sidebar(page).getByRole('button', { name: 'Close' }).click()
  await noteButton(page, 'Welcome').click()
  await editor(page).click()
  await page.keyboard.type('unsaved ')

  await titleBar(page).getByRole('button', { name: 'Close' }).click()
  const dialog = page.getByRole('dialog', { name: 'Quit with unsaved changes?' })
  await expect(dialog).toContainText('1 unsaved note')
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toBeHidden()
  expect(await mainState(slate.app)).toMatchObject({ visible: true })
})

test('a second launch focuses the running instance instead of starting another', async ({
  slate,
}) => {
  await slate.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].minimize())
  await expect.poll(async () => (await mainState(slate.app))?.min).toBe(true)

  const { exe, appPath } = await slate.app.evaluate(({ app }) => ({
    exe: process.execPath,
    appPath: app.getAppPath(),
  }))
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v
  delete env.ELECTRON_RUN_AS_NODE
  env.SLATE_E2E_USER_DATA = slate.userDataDir
  env.SLATE_E2E_VAULT = slate.vault.root
  const second = spawn(exe, [appPath], { env, stdio: 'ignore' })
  const code = await new Promise<number | null>((resolve) => {
    const t = setTimeout(() => {
      second.kill()
      resolve(-1)
    }, 20_000)
    second.once('exit', (c) => {
      clearTimeout(t)
      resolve(c)
    })
  })
  expect(code).toBe(0)
  await expect.poll(async () => (await mainState(slate.app))?.min).toBe(false)
  expect(
    await slate.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length),
  ).toBe(1)
})
