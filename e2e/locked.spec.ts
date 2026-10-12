import { expect, type Page, test } from './fixtures'
import {
  dirtyDot,
  editor,
  noteButton,
  noteRowAction,
  noticeToast,
  openSettings,
  passwordDialog,
  renameNoteViaSidebar,
  setVaultPassword,
  sidebar,
  submitUnlock,
  tabFor,
  typeInEditor,
} from './support/ui'

// Locked notes (E10): set password, lock/unlock, vault lock, wrong password,
// rename, restart, and every non-sidebar way of opening a locked note.

const PASSWORD = 'correct horse'
const HINT = 'the horse one'

test.use({
  vaultFiles: {
    'secret.md': 'TOP SECRET plaintext\n',
    'plain.md': 'plain note\n',
  },
  settings: { autoSave: false },
})

/** Locks `label` from the sidebar, setting the vault password first if needed. */
async function lockViaSidebar(page: Page, label: string, firstTime: boolean): Promise<void> {
  await noteRowAction(page, label, 'Lock')
  if (firstTime) await setVaultPassword(page, PASSWORD, HINT)
  await expect(
    sidebar(page).getByRole('button', { name: `Locked ${label}`, exact: true }),
  ).toBeVisible()
}

/** The content-pane state shown for a locked tab that isn't unlocked yet. */
function lockedPane(page: Page) {
  return page.getByRole('heading', { name: 'This note is locked' })
}

async function lockVaultFromSettings(page: Page): Promise<void> {
  await openSettings(page)
  await sidebar(page).getByRole('button', { name: 'Lock vault now' }).click()
  await expect(sidebar(page).getByText('Vault locked', { exact: true })).toBeVisible()
  await sidebar(page).getByTitle('Close', { exact: true }).click()
}

test('first lock sets the password; the note is encrypted at rest and opens this session', async ({
  page,
  vault,
}) => {
  await lockViaSidebar(page, 'secret', true)
  await expect.poll(() => vault.exists('secret.md.enc')).toBe(true)
  expect(vault.exists('secret.md')).toBe(false)
  expect((await vault.readBytes('secret.md.enc')).toString('latin1')).not.toContain('TOP SECRET')

  await noteButton(page, 'secret').click()
  await expect(passwordDialog(page)).toBeHidden()
  await expect(editor(page)).toContainText('TOP SECRET plaintext')
})

test('"Lock vault now" saves open locked tabs and turns them into locked placeholders', async ({
  page,
  vault,
}) => {
  await lockViaSidebar(page, 'secret', true)
  await noteButton(page, 'secret').click()
  await typeInEditor(page, ' + edit before lock')
  await expect(dirtyDot(tabFor(page, 'secret'))).toBeVisible()

  await lockVaultFromSettings(page)
  // The tab stays, as a locked placeholder: no editor, no plaintext on screen.
  await expect(tabFor(page, 'secret')).toHaveCount(1)
  await expect(lockedPane(page)).toBeVisible()
  await expect(page.locator('.cm-content')).toBeHidden()
  await expect(page.getByText('edit before lock')).toHaveCount(0)
  expect((await vault.readBytes('secret.md.enc')).toString('latin1')).not.toContain('edit before')

  // Reopening asks for the password; the edit made before locking was kept.
  await noteButton(page, 'secret').click()
  await expect(passwordDialog(page)).toBeVisible()
  await submitUnlock(page, PASSWORD)
  await expect(editor(page)).toContainText('edit before lock')
  await expect(tabFor(page, 'secret')).toHaveCount(1)
  await expect(lockedPane(page)).toBeHidden()
})

test('after a restart a locked note needs the password; a wrong one shows the error and hint', async ({
  page,
  slate,
}) => {
  await lockViaSidebar(page, 'secret', true)
  await noteButton(page, 'secret').click()
  await expect(editor(page)).toContainText('TOP SECRET')

  const page2 = await slate.restart()
  // The locked tab comes back as a placeholder; its text is not loaded.
  await expect(lockedPane(page2)).toBeVisible()
  await expect(page2.getByText('TOP SECRET')).toHaveCount(0)

  await noteButton(page2, 'secret').click()
  const dialog = page2.getByRole('dialog', { name: 'Unlock vault' })
  await expect(dialog).toBeVisible()
  await submitUnlock(page2, 'wrong password')
  await expect(dialog).toContainText('Wrong password')
  await expect(dialog).toContainText(HINT)
  await expect(page2.getByText('TOP SECRET')).toHaveCount(0)

  await submitUnlock(page2, PASSWORD)
  await expect(dialog).toBeHidden()
  await expect(editor(page2)).toContainText('TOP SECRET plaintext')
})

test('a locked note can be renamed while the vault is locked and keeps its .md.enc suffix', async ({
  page,
  vault,
}) => {
  await lockViaSidebar(page, 'secret', true)
  await lockVaultFromSettings(page)
  const bytes = await vault.readBytes('secret.md.enc')

  await renameNoteViaSidebar(page, 'secret', 'renamed secret')
  await expect.poll(() => vault.exists('renamed secret.md.enc')).toBe(true)
  expect((await vault.readBytes('renamed secret.md.enc')).equals(bytes)).toBe(true)
  await expect(
    sidebar(page).getByRole('button', { name: 'Locked renamed secret', exact: true }),
  ).toBeVisible()
})

test('opening a locked note from a reminder asks for the password', async ({ page, slate }) => {
  await lockViaSidebar(page, 'secret', true)
  await lockVaultFromSettings(page)

  await slate.app.evaluate(({ BrowserWindow }) => {
    for (const w of BrowserWindow.getAllWindows()) {
      w.webContents.send('reminder:navigate', { notePath: 'secret.md.enc' })
    }
  })
  await expect(page.getByRole('dialog', { name: 'Unlock vault' })).toBeVisible()
  await submitUnlock(page, PASSWORD)
  await expect(editor(page)).toContainText('TOP SECRET plaintext')
})

test('locking or unlocking never overwrites another note with the same name', async ({
  page,
  vault,
}) => {
  await lockViaSidebar(page, 'secret', true)
  const lockedBytes = await vault.readBytes('secret.md.enc')
  // A new plaintext note now reuses the name.
  await vault.write('secret.md', 'second note\n')
  await sidebar(page).getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(noteButton(page, 'secret')).toHaveCount(2)

  // Lock the plaintext one: would replace the existing secret.md.enc.
  await sidebar(page).getByRole('button', { name: 'secret', exact: true }).hover()
  await sidebar(page).getByRole('button', { name: 'Lock secret', exact: true }).click()
  await expect(noticeToast(page)).toContainText(/already exists/i)
  expect((await vault.readBytes('secret.md.enc')).equals(lockedBytes)).toBe(true)
  expect(await vault.read('secret.md')).toBe('second note\n')

  // Unlock the locked one: would replace the plaintext secret.md.
  await noticeToast(page).getByRole('button', { name: 'Dismiss' }).click()
  await sidebar(page).getByRole('button', { name: 'Locked secret', exact: true }).hover()
  await sidebar(page).getByRole('button', { name: 'Unlock secret', exact: true }).click()
  await expect(noticeToast(page)).toContainText(/already exists/i)
  expect(await vault.read('secret.md')).toBe('second note\n')
  expect(vault.exists('secret.md.enc')).toBe(true)
})

test('unlocking a note decrypts it back to plain markdown and keeps its open tab', async ({
  page,
  vault,
}) => {
  await lockViaSidebar(page, 'secret', true)
  await noteButton(page, 'secret').click()
  await noteRowAction(page, 'secret', 'Unlock')
  await expect.poll(() => vault.exists('secret.md')).toBe(true)
  expect(vault.exists('secret.md.enc')).toBe(false)
  expect(await vault.read('secret.md')).toBe('TOP SECRET plaintext\n')
  await expect(tabFor(page, 'secret')).toHaveCount(1)
  await expect(editor(page)).toContainText('TOP SECRET plaintext')
})

test('after a restart a locked tab is restored as a placeholder and its Unlock button loads it in place', async ({
  page,
  slate,
}) => {
  await lockViaSidebar(page, 'secret', true)
  await noteButton(page, 'secret').click()
  await noteButton(page, 'plain').click()

  const page2 = await slate.restart()
  const tab = tabFor(page2, 'secret')
  await expect(tab).toHaveCount(1)
  await expect(tab.getByRole('img', { name: 'Locked' })).toBeVisible()
  await expect(tabFor(page2, 'plain')).toHaveCount(1)
  await expect(editor(page2)).toContainText('plain note')

  await tab.getByRole('button').first().click()
  await expect(lockedPane(page2)).toBeVisible()
  await expect(page2.getByText('TOP SECRET')).toHaveCount(0)
  await page2.getByRole('button', { name: 'Unlock', exact: true }).click()
  await expect(passwordDialog(page2)).toBeVisible()
  await submitUnlock(page2, PASSWORD)
  await expect(passwordDialog(page2)).toBeHidden()
  await expect(editor(page2)).toContainText('TOP SECRET plaintext')
  await expect(tabFor(page2, 'secret')).toHaveCount(1)
  await expect(tab.getByRole('img', { name: 'Locked' })).toHaveCount(0)
  await expect(lockedPane(page2)).toBeHidden()

  // Edits in the unlocked tab save back encrypted.
  await typeInEditor(page2, ' + after unlock')
  await page2.keyboard.press('Control+s')
  await expect(dirtyDot(tabFor(page2, 'secret'))).toHaveCount(0)
})

test('a locked tab whose file was deleted while the app was closed is not restored', async ({
  page,
  slate,
  vault,
}) => {
  await lockViaSidebar(page, 'secret', true)
  await noteButton(page, 'secret').click()
  await noteButton(page, 'plain').click()
  await lockVaultFromSettings(page)

  const page2 = await slate.restart()
  await expect(tabFor(page2, 'secret')).toHaveCount(1)
  const { rm } = await import('node:fs/promises')
  await rm(vault.abs('secret.md.enc'))
  const page3 = await slate.restart()
  await expect(tabFor(page3, 'plain')).toHaveCount(1)
  await expect(tabFor(page3, 'secret')).toHaveCount(0)
})
