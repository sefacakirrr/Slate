import { expect, test } from './fixtures'
import {
  createNoteViaSidebar,
  deleteFolderViaSidebar,
  deleteNoteViaSidebar,
  editor,
  folderButton,
  noteButton,
  sidebar,
  toggleTrashView,
  trashRow,
  trashToast,
} from './support/ui'

// Every file a test deletes carries the run id ({run}), so the Recycle Bin can
// be asserted on and cleaned up without touching the user's own items.
test.use({
  vaultFiles: {
    '{run}-seeded.md': '# Seeded\n\nrestore me from the Trash view\n',
    '{run}-one.md': 'one body\n',
    '{run}-two.md': 'two body\n',
    '{run}-folder/a.md': 'nested a\n',
    '{run}-folder/deep/b.md': 'nested b\n',
    // A locked note: opaque bytes are enough — deleting/restoring never decrypts.
    '{run}-secret.md.enc': new Uint8Array([0, 1, 2, 3, 250, 251, 252, 253]),
  },
})

test('a note created in the UI goes to the Recycle Bin on delete and Undo brings it back', async ({
  page,
  vault,
  slate,
  recycleBin,
}) => {
  const label = slate.uid('typed')
  const file = `${label}.md`
  const body = 'Hello from the E2E suite'

  await createNoteViaSidebar(page, label)
  await expect.poll(() => vault.exists(file)).toBe(true)

  await editor(page).click()
  await page.keyboard.type(body)
  // Auto-save is on by default; wait until the content is on disk.
  await expect.poll(() => vault.read(file), { timeout: 15_000 }).toContain(body)
  const saved = await vault.read(file)

  await noteButton(page, label).hover()
  await sidebar(page)
    .getByRole('button', { name: `Delete ${label}`, exact: true })
    .click()
  const dialog = page.getByRole('dialog', { name: 'Delete note' })
  await expect(dialog).toContainText('moved to the Recycle Bin')
  await dialog.getByRole('button', { name: 'Delete', exact: true }).click()

  await expect(noteButton(page, label)).toBeHidden()
  await expect.poll(() => vault.exists(file)).toBe(false)
  await expect(trashToast(page)).toContainText(`Moved "${file}" to the Recycle Bin`)
  const binItem = await recycleBin.waitFor(file)
  expect(binItem.deletedFrom.toLowerCase()).toBe(vault.root.toLowerCase())
  // The in-app copy backs Undo and the Trash view.
  expect(await vault.trashIds()).toHaveLength(1)

  await trashToast(page).getByRole('button', { name: 'Undo' }).click()

  await expect(noteButton(page, label)).toBeVisible()
  await expect.poll(() => vault.exists(file)).toBe(true)
  expect(await vault.read(file)).toBe(saved)
  expect(await vault.trashIds()).toHaveLength(0)
})

test('a deleted note is restored from the Trash view', async ({
  page,
  vault,
  slate,
  recycleBin,
}) => {
  const label = slate.uid('seeded')
  const file = `${label}.md`
  const before = await vault.read(file)

  await deleteNoteViaSidebar(page, label)
  await expect.poll(() => vault.exists(file)).toBe(false)
  await recycleBin.waitFor(file)

  await toggleTrashView(page)
  await expect(sidebar(page)).toContainText('Deleted items also go to the Recycle Bin')
  const row = trashRow(page, file)
  await expect(row).toBeVisible()
  await row.getByRole('button', { name: 'Restore' }).click()
  await expect(sidebar(page).getByText('Trash is empty.')).toBeVisible()

  await expect.poll(() => vault.exists(file)).toBe(true)
  expect(await vault.read(file)).toBe(before)

  await toggleTrashView(page)
  await expect(noteButton(page, label)).toBeVisible()
})

test('deleting a folder recycles it and restoring brings back every nested note', async ({
  page,
  vault,
  slate,
  recycleBin,
}) => {
  const folder = slate.uid('folder')
  const nested = [`${folder}/a.md`, `${folder}/deep/b.md`]
  const contents = await Promise.all(nested.map((p) => vault.read(p)))

  await deleteFolderViaSidebar(page, folder)

  await expect(folderButton(page, folder)).toBeHidden()
  await expect(noteButton(page, 'a')).toBeHidden()
  await expect.poll(() => vault.exists(folder)).toBe(false)
  const binItem = await recycleBin.waitFor(folder)
  expect(binItem.isFolder).toBe(true)

  await toggleTrashView(page)
  await trashRow(page, folder).getByRole('button', { name: 'Restore' }).click()
  await expect(sidebar(page).getByText('Trash is empty.')).toBeVisible()

  await expect.poll(() => vault.listFiles(folder)).toEqual(nested)
  expect(await Promise.all(nested.map((p) => vault.read(p)))).toEqual(contents)

  await toggleTrashView(page)
  await expect(folderButton(page, folder)).toBeVisible()
  await expect(noteButton(page, 'b')).toBeVisible()
})

test('Delete permanently and Empty trash remove only the in-app copies', async ({
  page,
  vault,
  slate,
  recycleBin,
}) => {
  const one = `${slate.uid('one')}.md`
  const two = `${slate.uid('two')}.md`
  await deleteNoteViaSidebar(page, slate.uid('one'))
  await deleteNoteViaSidebar(page, slate.uid('two'))
  await recycleBin.waitFor(one)
  await recycleBin.waitFor(two)
  expect(await vault.trashIds()).toHaveLength(2)

  await toggleTrashView(page)
  await trashRow(page, one).getByRole('button', { name: 'Delete permanently' }).click()
  const dialog = page.getByRole('dialog', { name: 'Delete permanently' })
  await expect(dialog).toContainText('the copy in the Recycle Bin is kept')
  await dialog.getByRole('button', { name: 'Delete', exact: true }).click()

  await expect(sidebar(page).getByText(one, { exact: true })).toBeHidden()
  await expect.poll(() => vault.trashIds().then((ids) => ids.length)).toBe(1)

  await sidebar(page).getByRole('button', { name: 'Empty trash' }).click()
  await page
    .getByRole('dialog', { name: 'Empty trash' })
    .getByRole('button', { name: 'Empty trash' })
    .click()
  await expect(sidebar(page).getByText('Trash is empty.')).toBeVisible()
  await expect.poll(() => vault.trashIds().then((ids) => ids.length)).toBe(0)

  // Each original is in the Recycle Bin exactly once: purging the in-app copies
  // must not have sent duplicates there.
  await page.waitForTimeout(1_000)
  const items = await recycleBin.list()
  const named = (file: string) =>
    items.filter((i) => i.name === file || i.name === file.replace(/\.md$/, ''))
  expect(named(one)).toHaveLength(1)
  expect(named(two)).toHaveLength(1)
  expect(vault.exists(one)).toBe(false)
  expect(vault.exists(two)).toBe(false)
})

test('a locked note is recycled as-is and Undo restores identical bytes', async ({
  page,
  vault,
  slate,
  recycleBin,
}) => {
  const label = slate.uid('secret')
  const file = `${label}.md.enc`
  const bytes = await vault.readBytes(file)

  await deleteNoteViaSidebar(page, label)
  await expect.poll(() => vault.exists(file)).toBe(false)
  await recycleBin.waitFor(file)

  await trashToast(page).getByRole('button', { name: 'Undo' }).click()
  await expect.poll(() => vault.exists(file)).toBe(true)
  expect((await vault.readBytes(file)).equals(bytes)).toBe(true)
  await expect(noteButton(page, label)).toBeVisible()
})
