import { expect, type Page, test } from './fixtures'
import { dirtyDot, editor, noteButton, tabFor, tabLabels, typeInEditor } from './support/ui'

// Tabs & workspace: open/close/prompt/bulk-close/reorder/restore/quit.

test.use({
  vaultFiles: { 'a.md': 'alpha\n', 'b.md': 'bravo\n', 'c.md': 'charlie\n', 'd.md': 'delta\n' },
  settings: { autoSave: false },
})

async function openAll(page: Page, labels: string[]): Promise<void> {
  for (const l of labels) {
    await noteButton(page, l).click()
    await expect(tabFor(page, l)).toBeVisible()
  }
}

function unsavedDialog(page: Page) {
  return page.getByRole('dialog', { name: 'Unsaved changes' })
}

test('Ctrl+W on a dirty tab prompts: Cancel keeps it, Discard drops the edit, Save writes it', async ({
  page,
  vault,
}) => {
  await openAll(page, ['a', 'b'])
  await typeInEditor(page, ' edited-b')
  await expect(dirtyDot(tabFor(page, 'b'))).toBeVisible()

  await page.keyboard.press('Control+w')
  await expect(unsavedDialog(page)).toBeVisible()
  await unsavedDialog(page).getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(unsavedDialog(page)).toBeHidden()
  await expect(tabFor(page, 'b')).toBeVisible()

  await page.keyboard.press('Control+w')
  await unsavedDialog(page).getByRole('button', { name: 'Save', exact: true }).click()
  await expect(tabFor(page, 'b')).toHaveCount(0)
  expect(await vault.read('b.md')).toContain('edited-b')

  await noteButton(page, 'a').click()
  await typeInEditor(page, ' edited-a')
  await page.keyboard.press('Control+w')
  await unsavedDialog(page).getByRole('button', { name: 'Discard', exact: true }).click()
  await expect(tabFor(page, 'a')).toHaveCount(0)
  expect(await vault.read('a.md')).toBe('alpha\n')
})

test('Enter in the close prompt activates the focused button and never types into the note', async ({
  page,
  vault,
}) => {
  await openAll(page, ['a'])
  await typeInEditor(page, ' X')
  await page.keyboard.press('Control+w')
  await expect(unsavedDialog(page)).toBeVisible()
  // Focus starts on Save; Shift+Tab moves to Discard; Enter must Discard only.
  await page.keyboard.press('Shift+Tab')
  await expect(unsavedDialog(page).getByRole('button', { name: 'Discard' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(tabFor(page, 'a')).toHaveCount(0)
  await page.waitForTimeout(300)
  expect(await vault.read('a.md')).toBe('alpha\n')

  // Enter straight away saves exactly the edited text (no extra newline from the editor).
  await noteButton(page, 'b').click()
  await typeInEditor(page, ' Y')
  await page.keyboard.press('Control+w')
  await expect(unsavedDialog(page)).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(tabFor(page, 'b')).toHaveCount(0)
  expect(await vault.read('b.md')).toBe('bravo\n Y')
})

test('Close Others / Close All ask about each dirty tab instead of skipping it', async ({
  page,
  vault,
}) => {
  await openAll(page, ['a', 'b', 'c', 'd'])
  await noteButton(page, 'b').click()
  await typeInEditor(page, ' dirty-b')
  await noteButton(page, 'c').click()
  await typeInEditor(page, ' dirty-c')

  await tabFor(page, 'a').click({ button: 'right' })
  await page.getByRole('button', { name: 'Close Others', exact: true }).click()
  // d is clean → closed at once; b and c prompt one after the other.
  await expect(unsavedDialog(page)).toContainText('b.md')
  await unsavedDialog(page).getByRole('button', { name: 'Save', exact: true }).click()
  await expect(unsavedDialog(page)).toContainText('c.md')
  await unsavedDialog(page).getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(unsavedDialog(page)).toBeHidden()
  expect(await tabLabels(page)).toEqual(['a', 'c'])
  expect(await vault.read('b.md')).toContain('dirty-b')

  await tabFor(page, 'a').click({ button: 'right' })
  await page.getByRole('button', { name: 'Close All', exact: true }).click()
  await expect(unsavedDialog(page)).toContainText('c.md')
  await unsavedDialog(page).getByRole('button', { name: 'Discard', exact: true }).click()
  await expect(page.getByRole('tab')).toHaveCount(0)
  expect(await vault.read('c.md')).toBe('charlie\n')
})

test('dragging a tab reorders it and the order and active tab survive a restart', async ({
  page,
  slate,
}) => {
  await openAll(page, ['a', 'b', 'c'])
  await tabFor(page, 'c').dragTo(tabFor(page, 'a'))
  await expect.poll(() => tabLabels(page)).toEqual(['c', 'a', 'b'])
  await tabFor(page, 'a').getByRole('button', { name: 'a', exact: true }).click()

  const page2 = await slate.restart()
  await expect.poll(() => tabLabels(page2)).toEqual(['c', 'a', 'b'])
  await expect(tabFor(page2, 'a')).toHaveAttribute('tabindex', '0')
  await expect(editor(page2)).toContainText('alpha')
})

test('restoring tabs on restart skips a note deleted while the app was closed', async ({
  page,
  slate,
  vault,
}) => {
  await openAll(page, ['a', 'b', 'c'])
  await slate.restart().then(async (p) => {
    await expect.poll(() => tabLabels(p)).toEqual(['a', 'b', 'c'])
  })
  // Delete b on disk between sessions.
  const { rm } = await import('node:fs/promises')
  await rm(vault.abs('b.md'))
  const page3 = await slate.restart()
  await expect.poll(() => tabLabels(page3)).toEqual(['a', 'c'])
  await expect(editor(page3)).toContainText('charlie')
})

test('quitting with unsaved changes prompts; Cancel keeps the app, Quit closes it', async ({
  page,
  slate,
}) => {
  await openAll(page, ['a'])
  await typeInEditor(page, ' unsaved')
  await expect(dirtyDot(tabFor(page, 'a'))).toBeVisible()

  const closeMain = () =>
    slate.app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()
        .find((w) => w.isVisible())
        ?.close()
    })
  const dialog = page.getByRole('dialog', { name: 'Quit with unsaved changes?' })

  await closeMain()
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('1 unsaved note')
  // Cancel has focus, so a stray Enter keeps the app (and the unsaved note).
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(dialog).toBeHidden()
  await expect(dirtyDot(tabFor(page, 'a'))).toBeVisible()

  const exited = new Promise<void>((r) => slate.app.process().once('exit', () => r()))
  await closeMain()
  await expect(dialog).toBeVisible()
  // The window closes mid-click.
  await dialog
    .getByRole('button', { name: 'Quit', exact: true })
    .click()
    .catch(() => undefined)
  await exited
})
