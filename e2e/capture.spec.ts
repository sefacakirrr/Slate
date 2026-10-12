import type { ElectronApplication, Page } from './fixtures'
import { expect, test } from './fixtures'
import { noteButton, waitForWindow } from './support/ui'

/** Opens quick capture the way the global Ctrl+Shift+N shortcut does. */
async function openCapture(app: ElectronApplication): Promise<Page> {
  await app.evaluate(() => {
    ;(
      globalThis as unknown as { __slateE2E: { openQuickCapture: () => void } }
    ).__slateE2E.openQuickCapture()
  })
  const win = await waitForWindow(app, '#/capture')
  await expect(win.getByRole('textbox')).toBeVisible()
  return win
}

/** Presses a key that closes `win`: the keyup then has no page left to reach. */
async function pressClosing(win: Page, key: string): Promise<void> {
  await win.keyboard.press(key).catch(() => undefined)
}

async function captureWindowCount(app: ElectronApplication): Promise<number> {
  return app.evaluate(
    ({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().filter(
        (w) =>
          !w.isDestroyed() &&
          !w.webContents.isDestroyed() &&
          w.webContents.getURL().includes('#/capture'),
      ).length,
  )
}

test('quick capture saves a note into the vault and refreshes the tree', async ({
  slate,
  page,
  vault,
}) => {
  const win = await openCapture(slate.app)
  await win.getByRole('textbox').fill('Captured thought #idea')
  await win.keyboard.press('Control+Enter')

  await expect.poll(() => captureWindowCount(slate.app)).toBe(0)
  const files = (await vault.listFiles()).filter((f) => f.startsWith('quick-'))
  expect(files).toHaveLength(1)
  expect(await vault.read(files[0])).toBe('Captured thought #idea')
  await expect(noteButton(page, files[0].replace(/\.md$/, ''))).toBeVisible()
})

test('Esc with typed text keeps it as a draft for the next capture (#3)', async ({
  slate,
  vault,
}) => {
  let win = await openCapture(slate.app)
  await win.getByRole('textbox').fill('do not lose me')
  await pressClosing(win, 'Escape')
  await expect.poll(() => captureWindowCount(slate.app)).toBe(0)

  win = await openCapture(slate.app)
  await expect(win.getByRole('textbox')).toHaveValue('do not lose me')
  await expect(win.getByText('Unsaved draft restored')).toBeVisible()

  // Saving clears the draft: the next capture starts empty.
  await win.getByRole('button', { name: 'Save' }).click()
  await expect.poll(() => captureWindowCount(slate.app)).toBe(0)
  expect((await vault.listFiles()).filter((f) => f.startsWith('quick-'))).toHaveLength(1)
  win = await openCapture(slate.app)
  await expect(win.getByRole('textbox')).toHaveValue('')
})

test('losing focus does not lose typed text (#3)', async ({ slate }) => {
  let win = await openCapture(slate.app)
  await win.getByRole('textbox').fill('typed then clicked away')
  // What the OS does when the user clicks another window.
  await slate.app.evaluate(({ BrowserWindow }) => {
    for (const w of BrowserWindow.getAllWindows()) {
      if (w.webContents.getURL().includes('#/capture')) w.emit('blur')
    }
  })
  await expect.poll(() => captureWindowCount(slate.app)).toBe(0)

  win = await openCapture(slate.app)
  await expect(win.getByRole('textbox')).toHaveValue('typed then clicked away')
})

test('an empty capture closes on blur and Esc without leaving a draft', async ({ slate }) => {
  let win = await openCapture(slate.app)
  await pressClosing(win, 'Escape')
  await expect.poll(() => captureWindowCount(slate.app)).toBe(0)
  win = await openCapture(slate.app)
  await expect(win.getByText('Unsaved draft restored')).toBeHidden()
  await win.getByRole('button', { name: 'Cancel' }).click()
  await expect.poll(() => captureWindowCount(slate.app)).toBe(0)
})

test('a failed save shows the error and keeps the window and text (#3)', async ({ slate }) => {
  await slate.app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('capture:save')
    ipcMain.handle('capture:save', () => ({ ok: false, error: 'disk-full' }))
  })
  const win = await openCapture(slate.app)
  await win.getByRole('textbox').fill('keep me')
  await win.getByRole('button', { name: 'Save' }).click()

  await expect(win.getByRole('alert')).toContainText('disk-full')
  await expect(win.getByRole('button', { name: 'Save' })).toBeEnabled()
  await expect(win.getByRole('textbox')).toHaveValue('keep me')
  expect(await captureWindowCount(slate.app)).toBe(1)
})

test('reopening right after a close gives a capture window that can still be closed', async ({
  slate,
}) => {
  const first = await openCapture(slate.app)
  // Esc (capture:close) immediately followed by the shortcut: the first window's
  // late 'closed' event used to clear the new window's reference.
  await slate.app.evaluate(() => {
    const hook = (
      globalThis as unknown as {
        __slateE2E: { openQuickCapture: () => void; closeQuickCapture: () => void }
      }
    ).__slateE2E
    hook.closeQuickCapture()
    hook.openQuickCapture()
  })
  if (!first.isClosed()) await first.waitForEvent('close')
  await expect.poll(() => captureWindowCount(slate.app)).toBe(1)
  const win = await waitForWindow(slate.app, '#/capture')
  await expect(win.getByRole('textbox')).toBeVisible()
  await win.waitForTimeout(300)
  await win.getByRole('button', { name: 'Cancel' }).click()
  await expect.poll(() => captureWindowCount(slate.app)).toBe(0)
})
