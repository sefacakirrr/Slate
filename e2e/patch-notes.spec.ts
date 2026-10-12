import { expect, test } from './fixtures'

/** Shows the "What's New" modal again by forgetting the last seen version. */
async function showPatchNotes(page: import('./fixtures').Page) {
  await page.evaluate(() => localStorage.removeItem('slate:lastSeenVersion'))
  await page.reload()
  const dialog = page.getByRole('dialog', { name: /What's New/ })
  await expect(dialog).toBeVisible()
  return dialog
}

test('the What’s New modal fits a short window: title and button stay visible, the list scrolls', async ({
  slate,
  page,
}) => {
  await slate.app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((x) => !x.webContents.getURL().includes('#/'))
    w?.unmaximize()
    w?.setSize(1000, 480)
  })
  const dialog = await showPatchNotes(page)

  const viewport = await page.evaluate(() => ({ h: window.innerHeight }))
  const box = await dialog.boundingBox()
  expect(box).not.toBeNull()
  if (!box) return
  expect(box.y).toBeGreaterThanOrEqual(0)
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.h)

  await expect(dialog.getByRole('heading', { name: /What's New/ })).toBeInViewport()
  const gotIt = dialog.getByRole('button', { name: 'Got it' })
  await expect(gotIt).toBeInViewport()

  const list = dialog.getByRole('list')
  const scrolls = await list.evaluate((el) => el.scrollHeight > el.clientHeight)
  expect(scrolls).toBe(true)

  await gotIt.click()
  await expect(dialog).toBeHidden()
})

test('Escape closes the What’s New modal', async ({ page }) => {
  const dialog = await showPatchNotes(page)
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
})
