import { expect, test } from './fixtures'
import { editor, openSettings, searchDialog, sidebar } from './support/ui'

test.use({
  vaultFiles: {
    'Tagged.md': '# Tagged\n\nThis note is about #alpha things.\n',
    'Plain.md': '# Plain\n\nJust the word alpha with no hash.\n',
    'Other.md': '# Other\n\nnothing relevant, #beta here\n',
  },
})

test('Ctrl+Shift+F searches the vault, highlights matches and opens a hit', async ({ page }) => {
  await page.keyboard.press('Control+Shift+F')
  const dialog = searchDialog(page)
  await expect(dialog).toBeVisible()
  await dialog.getByRole('textbox', { name: 'Search notes' }).fill('alph')

  const hits = dialog.getByRole('listitem')
  await expect(hits).toHaveCount(2)
  await expect(dialog.locator('mark').first()).toHaveText(/alpha/i)

  await dialog.getByRole('button', { name: /Plain/ }).click()
  await expect(dialog).toBeHidden()
  await expect(editor(page)).toContainText('Just the word alpha')

  // Esc closes; reopening starts empty.
  await page.keyboard.press('Control+Shift+F')
  await expect(dialog.getByText('Type to search')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
})

test('clicking a tag chip shows only the tagged notes and keeps them (#4)', async ({ page }) => {
  const chip = sidebar(page).getByRole('button', { name: /^alpha\s*1$/ })
  await expect(chip).toBeVisible()
  await chip.click()

  const dialog = searchDialog(page)
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('listitem')).toHaveCount(1)
  await expect(dialog.getByRole('listitem')).toContainText('Tagged')
  // The panel's debounced full-text query used to replace the tag results with
  // an FTS search for "#alpha" (which also matches Plain.md).
  await page.waitForTimeout(800)
  await expect(dialog.getByRole('listitem')).toHaveCount(1)
  await expect(dialog.getByRole('listitem')).toContainText('Tagged')

  // Typing switches back to full-text search.
  await dialog.getByRole('textbox', { name: 'Search notes' }).fill('alpha')
  await expect(dialog.getByRole('listitem')).toHaveCount(2)
})

test('Rebuild search index picks up notes written behind the app', async ({ page, vault }) => {
  await vault.write('Sneaky.md', 'zebracorn appears here\n')
  await page.keyboard.press('Control+Shift+F')
  const dialog = searchDialog(page)
  await dialog.getByRole('textbox', { name: 'Search notes' }).fill('zebracorn')
  await expect(dialog.getByText('No results.')).toBeVisible()
  await page.keyboard.press('Escape')

  await openSettings(page)
  await sidebar(page).getByRole('button', { name: 'Rebuild search index' }).click()
  await expect(sidebar(page).getByText('Done', { exact: true })).toBeVisible()

  await page.keyboard.press('Control+Shift+F')
  await dialog.getByRole('textbox', { name: 'Search notes' }).fill('zebracorn')
  await expect(dialog.getByRole('listitem')).toHaveCount(1)
})
