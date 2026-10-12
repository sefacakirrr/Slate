import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Page } from './fixtures'
import { expect, test } from './fixtures'
import { editor, noteButton, openSettings, sidebar } from './support/ui'

const editorBg = (page: Page) =>
  page
    .locator('.cm-editor')
    .first()
    .evaluate((el) => getComputedStyle(el).backgroundColor)
const htmlClass = (page: Page) => page.evaluate(() => document.documentElement.className)
const rootFontSize = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.documentElement).fontSize)

async function settingsJson(userDataDir: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(join(userDataDir, 'settings.json'), 'utf-8'))
}

/** A real 2x2 PNG (red), small enough for any storage. */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==',
  'base64',
)

async function pickBackgroundImage(page: Page, file: { name: string; buffer: Buffer }) {
  const chooser = page.waitForEvent('filechooser')
  await sidebar(page)
    .getByRole('button', { name: /^(Select|Change) Image$/ })
    .click()
  await (await chooser).setFiles({ ...file, mimeType: 'image/png' })
}

test('dark / light / system theme apply, persist, and light mode recolours the editor (#9)', async ({
  slate,
  page,
}) => {
  await noteButton(page, 'Welcome').click()
  await expect(editor(page)).toBeVisible()
  expect(await htmlClass(page)).toContain('dark')
  expect(await editorBg(page)).toBe('rgb(10, 14, 26)')

  await openSettings(page)
  await sidebar(page).getByRole('button', { name: 'Light', exact: true }).click()
  expect(await htmlClass(page)).toContain('light')
  // The default editor colours follow the light theme instead of staying dark.
  await expect.poll(() => editorBg(page)).toBe('rgb(255, 255, 255)')
  await expect.poll(async () => (await settingsJson(slate.userDataDir)).theme).toBe('light')

  const page2 = await slate.restart()
  expect(await htmlClass(page2)).toContain('light')
  await noteButton(page2, 'Welcome').click()
  await expect.poll(() => editorBg(page2)).toBe('rgb(255, 255, 255)')

  // An explicitly chosen colour theme is kept in either mode.
  await openSettings(page2)
  await sidebar(page2).getByRole('button', { name: 'Dracula' }).click()
  await expect.poll(() => editorBg(page2)).toBe('rgb(40, 42, 54)')
})

test('System theme follows the OS even when the app started in Dark (#11)', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await openSettings(page)
  await sidebar(page).getByRole('button', { name: 'System', exact: true }).click()
  await expect.poll(() => htmlClass(page)).toContain('dark')

  await page.emulateMedia({ colorScheme: 'light' })
  await expect.poll(() => htmlClass(page)).toContain('light')
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect.poll(() => htmlClass(page)).toContain('dark')

  // Back in explicit Dark, OS changes no longer apply.
  await sidebar(page).getByRole('button', { name: 'Dark', exact: true }).click()
  await page.emulateMedia({ colorScheme: 'light' })
  await page.waitForTimeout(300)
  expect(await htmlClass(page)).toContain('dark')
})

test('importing a colour theme selects it and keeps it after restart', async ({ slate, page }) => {
  await noteButton(page, 'Welcome').click()
  await openSettings(page)
  const theme = {
    id: 'qa-mint',
    name: 'QA Mint',
    base: 'dark',
    colors: {
      bg: '#102030',
      fg: '#e0ffe0',
      gutterBg: '#102030',
      gutterFg: '#557755',
      activeLine: '#00000000',
      activeLineGutter: '#00000000',
      cursor: '#00ff99',
      selection: '#00ff9933',
      selectionFocused: '#00ff994d',
    },
  }
  const chooser = page.waitForEvent('filechooser')
  await sidebar(page).getByRole('button', { name: 'Import Theme (.json)' }).click()
  await (await chooser).setFiles({
    name: 'mint.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(theme)),
  })
  await expect(sidebar(page).getByRole('button', { name: 'QA Mint', exact: true })).toBeVisible()
  await expect.poll(() => editorBg(page)).toBe('rgb(16, 32, 48)')

  const page2 = await slate.restart()
  await noteButton(page2, 'Welcome').click()
  await expect.poll(() => editorBg(page2)).toBe('rgb(16, 32, 48)')
})

test('background image: reposition to the top edge, opacity, and both survive restart (#10)', async ({
  slate,
  page,
}) => {
  await openSettings(page)
  await pickBackgroundImage(page, { name: 'bg.png', buffer: TINY_PNG })

  // Drag the preview all the way up: position 0%.
  const preview = page.getByRole('application')
  const box = await preview.boundingBox()
  if (!box) throw new Error('no preview')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2, box.y - box.height, { steps: 5 })
  await page.mouse.up()
  await page.getByRole('button', { name: 'Apply' }).click()

  const layer = page.locator('div.bg-no-repeat.pointer-events-none')
  await expect(layer).toHaveCSS('background-position', '50% 0%')

  const opacity = sidebar(page).getByRole('slider').first()
  await opacity.fill('0.3')
  await expect(layer).toHaveCSS('opacity', '0.3')

  const page2 = await slate.restart()
  const layer2 = page2.locator('div.bg-no-repeat.pointer-events-none')
  await expect(layer2).toHaveCSS('background-position', '50% 0%')
  await expect(layer2).toHaveCSS('opacity', '0.3')

  // Remove clears it for good.
  await openSettings(page2)
  await sidebar(page2).getByRole('button', { name: 'Remove', exact: true }).click()
  await expect(layer2).toHaveCount(0)
})

test('a background image too large to store is reported, not silently dropped (#10)', async ({
  page,
}) => {
  await openSettings(page)
  // ~49 MB of bytes → a ~68M-char data URL: over Electron's localStorage quota (32M chars fit, 67M don't).
  const big = Buffer.concat([TINY_PNG, Buffer.alloc(49 * 1024 * 1024, 7)])
  await pickBackgroundImage(page, { name: 'huge.png', buffer: big })
  await page.getByRole('button', { name: 'Apply' }).click()

  await expect(page.getByRole('button', { name: 'Apply' })).toBeHidden()
  await expect(sidebar(page).getByRole('alert')).toContainText('too large')
})

test('font size: slider, Ctrl+= / Ctrl+-, Ctrl+wheel, and persistence', async ({ slate, page }) => {
  await noteButton(page, 'Welcome').click()
  expect(await rootFontSize(page)).toBe('14px')

  await editor(page).click()
  await page.keyboard.press('Control+Equal')
  await expect.poll(() => rootFontSize(page)).toBe('15px')
  await page.keyboard.press('Control+Minus')
  await page.keyboard.press('Control+Minus')
  await expect.poll(() => rootFontSize(page)).toBe('13px')

  await page.mouse.move(600, 300)
  await page.keyboard.down('Control')
  await page.mouse.wheel(0, -100)
  await page.keyboard.up('Control')
  await expect.poll(() => rootFontSize(page)).toBe('14px')

  await openSettings(page)
  await sidebar(page).getByRole('slider').fill('18')
  await expect.poll(() => rootFontSize(page)).toBe('18px')
  await expect(page.locator('.cm-editor').first()).toHaveCSS('font-size', '18px')
  await expect.poll(async () => (await settingsJson(slate.userDataDir)).fontSize).toBe(18)

  const page2 = await slate.restart()
  await expect.poll(() => rootFontSize(page2)).toBe('18px')
})

test('auto-save off keeps edits unsaved until Ctrl+S, and the choice persists', async ({
  slate,
  page,
  vault,
}) => {
  await openSettings(page)
  const toggle = sidebar(page).getByRole('switch', { name: 'Toggle auto-save' })
  await expect(toggle).toHaveAttribute('aria-checked', 'true')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-checked', 'false')
  await sidebar(page).getByRole('button', { name: 'Close' }).click()

  await noteButton(page, 'Welcome').click()
  await expect(editor(page)).toContainText('Seeded by the E2E fixture')
  await editor(page).click()
  await page.keyboard.press('Control+End')
  await page.keyboard.type(' manual')
  await expect(editor(page)).toContainText('manual')
  await page.waitForTimeout(2_500)
  expect(await vault.read('Welcome.md')).not.toContain('manual')
  await page.keyboard.press('Control+S')
  await expect.poll(() => vault.read('Welcome.md')).toContain('manual')

  const page2 = await slate.restart()
  await openSettings(page2)
  await expect(sidebar(page2).getByRole('switch', { name: 'Toggle auto-save' })).toHaveAttribute(
    'aria-checked',
    'false',
  )
})

test('background switches persist (tray switch updates main; login item stays dev-safe)', async ({
  slate,
  page,
}) => {
  await openSettings(page)
  const tray = sidebar(page).getByRole('switch', { name: /Keep running in the tray/ })
  const login = sidebar(page).getByRole('switch', { name: 'Launch Slate at startup' })
  await expect(tray).toHaveAttribute('aria-checked', 'false')
  await expect(login).toHaveAttribute('aria-checked', 'false')
  await tray.click()
  await login.click()
  await expect(tray).toHaveAttribute('aria-checked', 'true')
  await expect.poll(async () => (await settingsJson(slate.userDataDir)).closeToTray).toBe(true)
  await expect.poll(async () => (await settingsJson(slate.userDataDir)).launchAtLogin).toBe(true)
  // Unpackaged (E2E) builds never register an OS login item.
  expect(await slate.app.evaluate(({ app }) => app.getLoginItemSettings().openAtLogin)).toBe(false)

  // Turn tray back off so the restart below can quit normally.
  await tray.click()
  await expect.poll(async () => (await settingsJson(slate.userDataDir)).closeToTray).toBe(false)
  const page2 = await slate.restart()
  await openSettings(page2)
  await expect(
    sidebar(page2).getByRole('switch', { name: 'Launch Slate at startup' }),
  ).toHaveAttribute('aria-checked', 'true')
  await expect(
    sidebar(page2).getByRole('switch', { name: /Keep running in the tray/ }),
  ).toHaveAttribute('aria-checked', 'false')
})

test('vault password: set, lock now, unlock', async ({ page }) => {
  await openSettings(page)
  await sidebar(page).getByRole('button', { name: 'Set vault password' }).click()
  const dialog = page.getByRole('dialog', { name: 'Set vault password' })
  await dialog.getByPlaceholder('Vault password').fill('correct horse')
  await dialog.getByPlaceholder('Confirm password').fill('correct horse')
  await dialog.getByRole('checkbox').check()
  await dialog.getByRole('button', { name: 'Set password' }).click()
  await expect(dialog).toBeHidden()

  await expect(sidebar(page).getByText('Vault unlocked this session')).toBeVisible()
  await sidebar(page).getByRole('button', { name: 'Lock vault now' }).click()
  await expect(sidebar(page).getByText('Vault locked')).toBeVisible()

  await sidebar(page).getByRole('button', { name: 'Unlock vault' }).click()
  const unlock = page.getByRole('dialog', { name: 'Unlock vault' })
  await unlock.getByPlaceholder('Vault password').fill('wrong')
  await unlock.getByRole('button', { name: 'Unlock' }).click()
  await expect(unlock).toBeVisible()
  await unlock.getByPlaceholder('Vault password').fill('correct horse')
  await unlock.getByRole('button', { name: 'Unlock' }).click()
  await expect(unlock).toBeHidden()
  await expect(sidebar(page).getByText('Vault unlocked this session')).toBeVisible()
})

test('update check in an unpackaged build says updates need the installed app', async ({
  page,
}) => {
  await openSettings(page)
  await sidebar(page).getByRole('button', { name: 'Check for updates' }).click()
  await expect(
    sidebar(page).getByText('Updates are only available in the installed app.'),
  ).toBeVisible()
  await expect(page.getByText(/Downloading/)).toHaveCount(0)
})

test('patch notes show once per version', async ({ page }) => {
  await page.evaluate(() => localStorage.removeItem('slate:lastSeenVersion'))
  await page.reload()
  const gotIt = page.getByRole('button', { name: 'Got it' })
  await expect(page.getByRole('heading', { name: "What's New" })).toBeVisible()
  await gotIt.click()
  await expect(gotIt).toBeHidden()
  await page.reload()
  await expect(page.getByRole('button', { name: 'New note', exact: true })).toBeVisible()
  await page.waitForTimeout(500)
  await expect(page.getByRole('heading', { name: "What's New" })).toBeHidden()
})

test('an imported colour theme can be removed; removing the active one falls back to the default', async ({
  slate,
  page,
}) => {
  await noteButton(page, 'Welcome').click()
  await openSettings(page)
  // Built-in themes have no remove control.
  await sidebar(page).getByRole('button', { name: 'Dracula', exact: true }).hover()
  await expect(sidebar(page).getByRole('button', { name: /^Remove theme/ })).toHaveCount(0)

  const theme = {
    id: 'qa-rose',
    name: 'QA Rose',
    base: 'dark',
    colors: {
      bg: '#301020',
      fg: '#ffe0f0',
      gutterBg: '#301020',
      gutterFg: '#775566',
      activeLine: '#00000000',
      activeLineGutter: '#00000000',
      cursor: '#ff0099',
      selection: '#ff009933',
      selectionFocused: '#ff00994d',
    },
  }
  const chooser = page.waitForEvent('filechooser')
  await sidebar(page).getByRole('button', { name: 'Import Theme (.json)' }).click()
  await (await chooser).setFiles({
    name: 'rose.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(theme)),
  })
  const card = sidebar(page).getByRole('button', { name: 'QA Rose', exact: true })
  await expect(card).toBeVisible()
  await expect.poll(() => editorBg(page)).toBe('rgb(48, 16, 32)')

  // Hover reveals the ×; Cancel in the confirm keeps the theme.
  const remove = sidebar(page).getByRole('button', { name: 'Remove theme QA Rose' })
  await card.hover()
  await remove.click()
  const dialog = page.getByRole('dialog', { name: 'Remove theme' })
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(card).toBeVisible()

  await card.hover()
  await remove.click()
  await dialog.getByRole('button', { name: 'Remove', exact: true }).click()
  await expect(card).toHaveCount(0)
  // Active theme removed → the dark default.
  await expect.poll(() => editorBg(page)).toBe('rgb(10, 14, 26)')

  // In light mode the fallback is the light default; and the removal persists.
  await sidebar(page).getByRole('button', { name: 'Light', exact: true }).click()
  await expect.poll(() => editorBg(page)).toBe('rgb(255, 255, 255)')
  const page2 = await slate.restart()
  await openSettings(page2)
  await expect(sidebar(page2).getByRole('button', { name: 'QA Rose', exact: true })).toHaveCount(0)
})
