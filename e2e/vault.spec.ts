import { expect, test } from './fixtures'
import {
  createNoteViaSidebar,
  deleteFolderViaSidebar,
  deleteNoteViaSidebar,
  dirtyDot,
  editor,
  folderButton,
  folderRowAction,
  noteButton,
  noticeToast,
  renameFolderViaSidebar,
  renameNoteViaSidebar,
  sidebar,
  tabFor,
  typeInEditor,
} from './support/ui'

// Vault & file tree, exercised through the sidebar like a user would.

test.describe('create', () => {
  test.use({ vaultFiles: { 'Existing.md': 'existing\n', 'Folder/inner.md': 'inner\n' } })

  test('notes with Turkish characters and spaces are created at the root and inside a folder', async ({
    page,
    vault,
  }) => {
    await createNoteViaSidebar(page, 'Çalışma Notları şğüöı')
    await expect.poll(() => vault.exists('Çalışma Notları şğüöı.md')).toBe(true)
    await expect(tabFor(page, 'Çalışma Notları şğüöı')).toBeVisible()

    await folderRowAction(page, 'Folder', 'New note here')
    const input = sidebar(page).getByPlaceholder('Note name')
    await input.fill('İç Not')
    await input.press('Enter')
    await expect.poll(() => vault.exists('Folder/İç Not.md')).toBe(true)
    await expect(noteButton(page, 'İç Not')).toBeVisible()
    await expect(tabFor(page, 'İç Not')).toBeVisible()
  })

  test('a duplicate note name keeps the input open with a visible error', async ({
    page,
    vault,
  }) => {
    await sidebar(page).getByRole('button', { name: 'New note', exact: true }).click()
    const input = sidebar(page).getByRole('textbox', { name: 'New note name' })
    await input.fill('Existing')
    await input.press('Enter')
    await expect(sidebar(page).getByRole('alert')).toHaveText(/already exists/i)
    await expect(input).toBeVisible()
    expect(await vault.read('Existing.md')).toBe('existing\n')
  })

  test('a name with characters Windows forbids is rejected, not written as a hidden stream', async ({
    page,
    vault,
  }) => {
    await sidebar(page).getByRole('button', { name: 'New note', exact: true }).click()
    const input = sidebar(page).getByRole('textbox', { name: 'New note name' })
    await input.fill('ab:c')
    await input.press('Enter')
    await expect(sidebar(page).getByRole('alert')).toHaveText(/can't contain/i)
    await expect(input).toBeVisible()
    // NTFS would have created file "ab" with an alternate data stream "c.md".
    expect(await vault.listFiles('', { skipDot: true })).toEqual(['Existing.md', 'Folder/inner.md'])
  })

  test('a duplicate folder name shows a readable error', async ({ page }) => {
    await sidebar(page).getByRole('button', { name: 'New folder', exact: true }).click()
    const input = sidebar(page).getByRole('textbox', { name: 'New folder name' })
    await input.fill('bad|name')
    await input.press('Enter')
    await expect(sidebar(page).getByRole('alert')).toHaveText(/can't contain/i)
  })

  test('Ctrl+T creates an untitled note and opens it', async ({ page, vault }) => {
    await sidebar(page).getByText('Notes', { exact: true }).click()
    await page.keyboard.press('Control+t')
    await expect(page.getByRole('tab')).toHaveCount(1)
    await expect
      .poll(async () =>
        (await vault.listFiles('', { skipDot: true })).filter((f) => f.startsWith('untitled-')),
      )
      .toHaveLength(1)
  })
})

test.describe('rename', () => {
  test.use({
    vaultFiles: { 'alpha.md': 'alpha body\n', 'beta.md': 'beta body\n', 'notes.md': 'case\n' },
    settings: { autoSave: false },
  })

  test('a case-only rename works', async ({ page, vault }) => {
    await renameNoteViaSidebar(page, 'notes', 'Notes')
    await expect(noteButton(page, 'Notes')).toBeVisible()
    await expect.poll(() => vault.listFiles('', { skipDot: true })).toContain('Notes.md')
    expect(await vault.read('Notes.md')).toBe('case\n')
  })

  test('renaming onto an existing note shows a readable error and keeps both files', async ({
    page,
    vault,
  }) => {
    await renameNoteViaSidebar(page, 'alpha', 'beta')
    await expect(sidebar(page).getByRole('alert')).toHaveText(/already exists/i)
    expect(await vault.read('alpha.md')).toBe('alpha body\n')
    expect(await vault.read('beta.md')).toBe('beta body\n')
  })

  test('changing the extension renames the file and an open dirty tab follows it', async ({
    page,
    vault,
  }) => {
    await noteButton(page, 'alpha').click()
    await typeInEditor(page, 'unsaved')
    await expect(dirtyDot(tabFor(page, 'alpha'))).toBeVisible()
    await renameNoteViaSidebar(page, 'alpha', 'alpha.txt')
    await expect.poll(() => vault.exists('alpha.txt')).toBe(true)
    expect(vault.exists('alpha.md')).toBe(false)
    const tab = tabFor(page, 'alpha')
    await expect(tab).toHaveCount(1)
    await expect(dirtyDot(tab)).toBeVisible()
    await page.keyboard.press('Control+s')
    await expect.poll(() => vault.read('alpha.txt')).toContain('unsaved')
  })
})

test.describe('drag & move', () => {
  test.use({
    vaultFiles: {
      'Box/inside.md': 'inside\n',
      'Box/Sub/deep.md': 'deep\n',
      'Other/x.md': 'x\n',
      'loose.md': 'loose\n',
      'Other/loose.md': 'clash\n',
      'a.md': 'a\n',
      'b.md': 'b\n',
      'c.md': 'c\n',
    },
    settings: { autoSave: false },
  })

  test('moving a folder keeps its open tabs, including unsaved edits', async ({ page, vault }) => {
    await noteButton(page, 'inside').click()
    await typeInEditor(page, 'edited before move')
    await expect(dirtyDot(tabFor(page, 'inside'))).toBeVisible()

    await folderButton(page, 'Box').dragTo(folderButton(page, 'Other'))
    await expect.poll(() => vault.exists('Other/Box/inside.md')).toBe(true)

    const tab = tabFor(page, 'inside')
    await expect(tab).toHaveCount(1)
    await expect(dirtyDot(tab)).toBeVisible()
    await expect(editor(page)).toContainText('edited before move')
    await page.keyboard.press('Control+s')
    await expect.poll(() => vault.read('Other/Box/inside.md')).toContain('edited before move')
  })

  test('a folder cannot be dropped into its own subfolder', async ({ page, vault }) => {
    await folderButton(page, 'Box').dragTo(folderButton(page, 'Sub'))
    await page.waitForTimeout(500)
    expect(await vault.listFiles('Box')).toEqual(['Box/Sub/deep.md', 'Box/inside.md'])
  })

  test('moving a note onto a folder that has the same name shows an error', async ({
    page,
    vault,
  }) => {
    // Folders sort first, so the root-level 'loose' is the last match.
    await noteButton(page, 'loose').last().dragTo(folderButton(page, 'Other'))
    await expect(noticeToast(page)).toContainText(/already exists/i)
    expect(await vault.read('loose.md')).toBe('loose\n')
    expect(await vault.read('Other/loose.md')).toBe('clash\n')
  })

  test('drag-reordering notes persists across a restart', async ({ page, slate }) => {
    const rootNotes = async (p: typeof page) => {
      const names = await sidebar(p)
        .getByRole('button', { name: /^[abc]$/ })
        .allTextContents()
      return names.map((n) => n.trim())
    }
    expect(await rootNotes(page)).toEqual(['a', 'b', 'c'])
    const target = noteButton(page, 'a')
    await noteButton(page, 'c').dragTo(target, { targetPosition: { x: 10, y: 2 } })
    await expect.poll(() => rootNotes(page)).toEqual(['c', 'a', 'b'])

    const page2 = await slate.restart()
    await expect.poll(() => rootNotes(page2)).toEqual(['c', 'a', 'b'])
  })
})

test.describe('list view', () => {
  test.use({ vaultFiles: { 'one.md': '# One\nfirst\n' } })

  test('New note works while the list view is showing', async ({ page, vault }) => {
    await sidebar(page).getByRole('button', { name: 'List view', exact: true }).click()
    await expect(sidebar(page).getByRole('button', { name: /One/ })).toBeVisible()
    await sidebar(page).getByRole('button', { name: 'New note', exact: true }).click()
    const input = sidebar(page).getByRole('textbox', { name: 'New note name' })
    await input.fill('from list')
    await input.press('Enter')
    await expect.poll(() => vault.exists('from list.md')).toBe(true)
    await expect(sidebar(page).getByRole('button', { name: /from list/ })).toBeVisible()
  })

  test('Refresh picks up files created outside the app', async ({ page, vault }) => {
    await vault.write('external.md', 'made outside\n')
    await sidebar(page).getByRole('button', { name: 'Refresh', exact: true }).click()
    await expect(noteButton(page, 'external')).toBeVisible()
  })
})

test.describe('delete with unsaved edits', () => {
  test.use({
    vaultFiles: { '{run}-dirty.md': 'on disk\n', '{run}-dir/inner.md': 'inner on disk\n' },
    settings: { autoSave: false },
  })

  test('deleting a note with unsaved edits keeps those edits in the trashed copy', async ({
    page,
    vault,
    slate,
    recycleBin,
  }) => {
    const label = slate.uid('dirty')
    await noteButton(page, label).click()
    await typeInEditor(page, 'precious edit')
    await expect(dirtyDot(tabFor(page, label))).toBeVisible()
    await deleteNoteViaSidebar(page, label)
    await expect(tabFor(page, label)).toHaveCount(0)
    await recycleBin.waitFor(`${label}.md`)
    // Undo restores the note including the edit that was unsaved at delete time.
    await page.getByRole('status').getByRole('button', { name: 'Undo' }).click()
    await expect.poll(() => vault.exists(`${label}.md`)).toBe(true)
    expect(await vault.read(`${label}.md`)).toContain('precious edit')
  })

  test('deleting a folder with an unsaved open note keeps the edit in the trashed copy', async ({
    page,
    vault,
    slate,
    recycleBin,
  }) => {
    const folder = slate.uid('dir')
    await noteButton(page, 'inner').click()
    await typeInEditor(page, 'folder edit')
    await expect(dirtyDot(tabFor(page, 'inner'))).toBeVisible()
    await deleteFolderViaSidebar(page, folder)
    await expect(tabFor(page, 'inner')).toHaveCount(0)
    await recycleBin.waitFor(folder)
    await page.getByRole('status').getByRole('button', { name: 'Undo' }).click()
    await expect.poll(() => vault.exists(`${folder}/inner.md`)).toBe(true)
    expect(await vault.read(`${folder}/inner.md`)).toContain('folder edit')
  })
})

test.describe('first launch', () => {
  test.use({ settings: { vaultPath: null } })

  test('the empty state picks a vault folder and shows its notes', async ({
    page,
    slate,
    vault,
  }) => {
    await expect(page.getByRole('heading', { name: 'No vault selected' })).toBeVisible()
    await slate.app.evaluate(({ dialog }, root) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [root] })) as never
    }, vault.root)
    await page.getByRole('button', { name: 'Choose Folder' }).click()
    await expect(noteButton(page, 'Welcome')).toBeVisible()
    // The first vault pick offers the import wizard once; dismiss it.
    const wizard = page.getByRole('dialog', { name: 'Import notes' })
    await expect(wizard).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(wizard).toBeHidden()
    await noteButton(page, 'Welcome').click()
    await expect(editor(page)).toContainText('Seeded by the E2E fixture')
  })
})

test.describe('save shortcut', () => {
  test.use({ vaultFiles: { 'alpha.md': 'alpha body\n' }, settings: { autoSave: false } })

  test('Ctrl+S saves the active tab while focus is outside the editor', async ({ page, vault }) => {
    await noteButton(page, 'alpha').click()
    await typeInEditor(page, 'focus elsewhere')
    await expect(dirtyDot(tabFor(page, 'alpha'))).toBeVisible()
    // Focus the sidebar's note row (a button), not the editor.
    await noteButton(page, 'alpha').focus()
    await page.keyboard.press('Control+s')
    await expect.poll(() => vault.read('alpha.md')).toContain('focus elsewhere')
    await expect(dirtyDot(tabFor(page, 'alpha'))).toHaveCount(0)
  })
})

test.describe('folder rename', () => {
  test.use({
    vaultFiles: {
      'Box/inside.md': 'inside\n',
      'Box/a.md': 'a\n',
      'Box/b.md': 'b\n',
      'Box/Sub/deep.md': 'deep\n',
      'Other/x.md': 'x\n',
    },
    settings: { autoSave: false },
  })

  test('renaming a folder keeps its open tab and unsaved edit, which then saves to the new path', async ({
    page,
    vault,
  }) => {
    await noteButton(page, 'inside').click()
    await typeInEditor(page, 'edited before rename')
    await expect(dirtyDot(tabFor(page, 'inside'))).toBeVisible()

    await renameFolderViaSidebar(page, 'Box', 'Crate')
    await expect(folderButton(page, 'Crate')).toBeVisible()
    await expect.poll(() => vault.exists('Crate/inside.md')).toBe(true)
    expect(vault.exists('Box')).toBe(false)
    await expect(noteButton(page, 'deep')).toBeVisible()

    const tab = tabFor(page, 'inside')
    await expect(tab).toHaveCount(1)
    await expect(dirtyDot(tab)).toBeVisible()
    await expect(editor(page)).toContainText('edited before rename')
    await page.keyboard.press('Control+s')
    await expect.poll(() => vault.read('Crate/inside.md')).toContain('edited before rename')
    expect(vault.exists('Box/inside.md')).toBe(false)
  })

  test('a clash or an invalid name keeps the input open with an inline error', async ({
    page,
    vault,
  }) => {
    await renameFolderViaSidebar(page, 'Box', 'Other')
    const input = sidebar(page).getByRole('textbox', { name: 'New folder name' })
    await expect(sidebar(page).getByRole('alert')).toHaveText(/already exists/i)
    await expect(input).toBeVisible()

    await input.fill('bad|name')
    await input.press('Enter')
    await expect(sidebar(page).getByRole('alert')).toHaveText(/can't contain/i)
    await input.fill('nested/name')
    await input.press('Enter')
    await expect(sidebar(page).getByRole('alert')).toHaveText(/can't contain/i)

    await input.press('Escape')
    await expect(input).toBeHidden()
    expect(await vault.listFiles('Box')).toEqual([
      'Box/Sub/deep.md',
      'Box/a.md',
      'Box/b.md',
      'Box/inside.md',
    ])
    expect(await vault.read('Other/x.md')).toBe('x\n')
  })

  test('a case-only folder rename works', async ({ page, vault }) => {
    await renameFolderViaSidebar(page, 'Box', 'box')
    await expect(folderButton(page, 'box')).toBeVisible()
    await expect
      .poll(async () =>
        (await vault.listFiles('', { skipDot: true })).filter((f) => f.endsWith('inside.md')),
      )
      .toEqual(['box/inside.md'])
  })

  test('the custom note order and collapsed subfolders follow the renamed folder', async ({
    page,
    slate,
  }) => {
    const boxNotes = async (p: typeof page) =>
      (
        await sidebar(p)
          .getByRole('button', { name: /^(a|b|inside)$/ })
          .allTextContents()
      ).map((n) => n.trim())
    expect(await boxNotes(page)).toEqual(['a', 'b', 'inside'])
    await noteButton(page, 'inside').dragTo(noteButton(page, 'a'), {
      targetPosition: { x: 10, y: 2 },
    })
    await expect.poll(() => boxNotes(page)).toEqual(['inside', 'a', 'b'])
    await folderButton(page, 'Sub').click()
    await expect(noteButton(page, 'deep')).toBeHidden()

    await renameFolderViaSidebar(page, 'Box', 'Crate')
    await expect(folderButton(page, 'Crate')).toBeVisible()
    await expect.poll(() => boxNotes(page)).toEqual(['inside', 'a', 'b'])
    await expect(folderButton(page, 'Sub')).toBeVisible()
    await expect(noteButton(page, 'deep')).toBeHidden()

    const page2 = await slate.restart()
    await expect(folderButton(page2, 'Crate')).toBeVisible()
    await expect.poll(() => boxNotes(page2)).toEqual(['inside', 'a', 'b'])
  })
})
