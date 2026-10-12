import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import AdmZip from 'adm-zip'
import type { ElectronApplication, Page } from './fixtures'
import { expect, test } from './fixtures'
import { editor, folderButton, noteButton, openSettings, searchDialog, sidebar } from './support/ui'

let srcRoot: string
test.beforeEach(async () => {
  srcRoot = await mkdtemp(join(tmpdir(), 'slate-qa3-import-'))
})
test.afterEach(async () => {
  await rm(srcRoot, { recursive: true, force: true })
})

/** Makes the next native open dialog "pick" `path` (main process). */
async function stubOpenDialog(app: ElectronApplication, path: string): Promise<void> {
  await app.evaluate(({ dialog }, p) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [p] })) as never
  }, path)
}

async function openImportWizard(page: Page) {
  await openSettings(page)
  await sidebar(page).getByRole('button', { name: 'Import notes' }).click()
  const wizard = page.getByRole('dialog', { name: 'Import notes' })
  await expect(wizard).toBeVisible()
  return wizard
}

test('importing a folder copies notes (subfolders kept) and makes them searchable', async ({
  slate,
  page,
  vault,
}) => {
  const src = join(srcRoot, 'OldNotes')
  await mkdir(join(src, 'sub'), { recursive: true })
  await writeFile(join(src, 'alpha.md'), '# Alpha\n\nquokkaword in markdown\n')
  await writeFile(join(src, 'sub', 'beta.txt'), 'plain beta text\n')
  await writeFile(join(src, 'gamma.html'), '<h1>Gamma</h1><p>Some <b>bold</b> html</p>')
  await writeFile(join(src, 'image.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]))
  await stubOpenDialog(slate.app, src)

  const wizard = await openImportWizard(page)
  await wizard.getByRole('button', { name: /Folder of notes/ }).click()
  await expect(wizard).toContainText('Found 3 notes in OldNotes')
  await expect(wizard.getByRole('radio', { name: 'Imported/OldNotes/' })).toBeChecked()
  await wizard.getByRole('button', { name: 'Import 3 notes' }).click()
  await expect(wizard).toContainText('Imported 3 notes into Imported/OldNotes/')
  await wizard.getByRole('button', { name: 'Done' }).click()
  await expect(wizard).toBeHidden()

  expect((await vault.listFiles('Imported')).sort()).toEqual([
    'Imported/OldNotes/alpha.md',
    'Imported/OldNotes/gamma.md',
    'Imported/OldNotes/sub/beta.md',
  ])
  expect(await vault.read('Imported/OldNotes/gamma.md')).toMatch(/# Gamma[\s\S]*\*\*bold\*\*/)
  // Originals untouched.
  expect(await readFile(join(src, 'alpha.md'), 'utf-8')).toContain('quokkaword')

  await sidebar(page).getByRole('button', { name: 'Close' }).click()
  await expect(folderButton(page, 'Imported')).toBeVisible()
  await page.keyboard.press('Control+Shift+F')
  await searchDialog(page).getByRole('textbox').fill('quokkaword')
  await searchDialog(page).getByRole('button', { name: /alpha/ }).click()
  await expect(editor(page)).toContainText('quokkaword in markdown')
})

test('importing a Notion export zip strips ids, rewrites asset links, and can target the root', async ({
  slate,
  page,
  vault,
}) => {
  const zip = new AdmZip()
  const id = '0123456789abcdef0123456789abcdef'
  zip.addFile(
    `Export/Trip Plan ${id}.md`,
    Buffer.from(`# Trip Plan\n\n![map](Trip%20Plan%20${id}/map.png)\n`),
  )
  zip.addFile(`Export/Trip Plan ${id}/map.png`, Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]))
  zip.addFile(`Export/Packing ${'f'.repeat(32)}.md`, Buffer.from('# Packing\n\n- socks\n'))
  zip.addFile(`Export/Budget ${'a'.repeat(32)}.csv`, Buffer.from('a,b\n1,2\n'))
  const zipPath = join(srcRoot, 'Notion Export.zip')
  await writeFile(zipPath, zip.toBuffer())
  await stubOpenDialog(slate.app, zipPath)

  const wizard = await openImportWizard(page)
  await wizard.getByRole('button', { name: /Notion export/ }).click()
  await expect(wizard).toContainText('Found 2 notes in Notion Export (Notion export).')
  await wizard.getByRole('radio', { name: 'Vault root' }).check()
  await wizard.getByRole('button', { name: 'Import 2 notes' }).click()
  await expect(wizard).toContainText('Imported 2 notes')
  await wizard.getByRole('button', { name: 'Done' }).click()

  const trip = await vault.read('Trip Plan.md')
  const link = trip.match(/\]\((_attachments\/[0-9a-f]{64}\.png)\)/)
  expect(link).not.toBeNull()
  expect(vault.exists(link?.[1] ?? '')).toBe(true)
  expect(vault.exists('Packing.md')).toBe(true)
  await sidebar(page).getByRole('button', { name: 'Close' }).click()
  await expect(noteButton(page, 'Trip Plan')).toBeVisible()
})

test('a source with nothing importable shows an error and Try again returns to the picker', async ({
  slate,
  page,
}) => {
  const zipPath = join(srcRoot, 'empty.zip')
  const zip = new AdmZip()
  zip.addFile('only.csv', Buffer.from('a,b\n'))
  await writeFile(zipPath, zip.toBuffer())
  await stubOpenDialog(slate.app, zipPath)

  const wizard = await openImportWizard(page)
  await wizard.getByRole('button', { name: /Notion export/ }).click()
  await expect(wizard).toContainText('No importable notes found in that source.')
  await wizard.getByRole('button', { name: 'Try again' }).click()
  await expect(wizard.getByRole('button', { name: /Folder of notes/ })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(wizard).toBeHidden()
})

test('the first step has a visible Cancel button that closes the wizard', async ({ page }) => {
  const wizard = await openImportWizard(page)
  const cancel = wizard.getByRole('button', { name: 'Cancel', exact: true })
  await expect(cancel).toBeVisible()
  await cancel.click()
  await expect(wizard).toBeHidden()
})
