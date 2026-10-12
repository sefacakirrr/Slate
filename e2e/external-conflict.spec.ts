import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type ElectronApplication, expect, type Page, test } from './fixtures'
import { editor, editorDoc, openNote } from './support/ui'

/**
 * Disk-change safety: a file changed by another program since Slate loaded or
 * saved it is never silently overwritten (conflict prompt), clean tabs pick up
 * outside changes when the window regains focus, and a deleted external file
 * stays open (marked) and is recreated by saving.
 */

let outside: string

test.beforeEach(async () => {
  outside = await mkdtemp(join(tmpdir(), 'slate-e2e-conflict-'))
})

test.afterEach(async () => {
  await rm(outside, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
})

async function openViaSecondInstance(app: ElectronApplication, paths: string[]): Promise<void> {
  await app.evaluate(
    ({ app: a }, args) => {
      a.emit('second-instance', {}, ['electron.exe', '.', ...args.paths], args.cwd, {})
    },
    { paths, cwd: outside },
  )
}

function tab(page: Page, label: string) {
  return page.getByRole('tab').filter({ hasText: label })
}

function conflictDialog(page: Page) {
  return page.getByRole('dialog', { name: 'File changed on disk' })
}

/** Simulates the Slate window regaining focus (e.g. alt-tab back from another editor). */
async function refocus(page: Page): Promise<void> {
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
}

const read = async (p: string) => (await readFile(p)).toString('utf-8')

async function openExternal(page: Page, app: ElectronApplication, name: string, body: string) {
  const file = join(outside, name)
  await writeFile(file, body)
  await openViaSecondInstance(app, [file])
  await expect(tab(page, name.replace(/\.\w+$/, ''))).toBeVisible()
  await expect(editor(page)).toContainText(body.trim().split('\n')[0])
  return file
}

test('auto-save never overwrites an outside edit: one prompt, Cancel stays quiet, Overwrite writes', async ({
  slate,
  page,
}) => {
  const file = await openExternal(page, slate.app, 'notes.md', 'line one\n')
  await writeFile(file, 'changed elsewhere\n')

  await editor(page).click()
  await page.keyboard.press('Control+End')
  await page.keyboard.type('mine')
  await expect(conflictDialog(page)).toBeVisible({ timeout: 10_000 })
  expect(await read(file)).toBe('changed elsewhere\n')

  // Cancel keeps the edits unsaved; further auto-saves don't re-prompt for the same disk version.
  await conflictDialog(page).getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(conflictDialog(page)).toBeHidden()
  await editor(page).click()
  await page.keyboard.press('Control+End')
  await page.keyboard.type(' more')
  await page.waitForTimeout(2_500)
  await expect(conflictDialog(page)).toBeHidden()
  expect(await read(file)).toBe('changed elsewhere\n')
  await expect(tab(page, 'notes').getByRole('img', { name: 'Unsaved changes' })).toBeVisible()

  // A manual save asks again; Overwrite writes Slate's version.
  await page.keyboard.press('Control+s')
  await expect(conflictDialog(page)).toBeVisible()
  await conflictDialog(page).getByRole('button', { name: 'Overwrite', exact: true }).click()
  await expect.poll(() => read(file)).toBe('line one\nmine more')
  await expect(tab(page, 'notes').getByRole('img', { name: 'Unsaved changes' })).toBeHidden()
})

test.describe('with auto-save off', () => {
  test.use({ settings: { autoSave: false } })

  test('Reload discards Slate edits and loads the disk version', async ({ slate, page }) => {
    const file = await openExternal(page, slate.app, 'reload.md', 'original\n')
    await writeFile(file, 'from the other app\n')

    await editor(page).click()
    await page.keyboard.press('Control+End')
    await page.keyboard.type('draft')
    await page.keyboard.press('Control+s')
    await conflictDialog(page).getByRole('button', { name: 'Reload', exact: true }).click()
    await expect(conflictDialog(page)).toBeHidden()
    await expect.poll(() => editorDoc(page)).toBe('from the other app\n')
    await expect(tab(page, 'reload').getByRole('img', { name: 'Unsaved changes' })).toBeHidden()
    expect(await read(file)).toBe('from the other app\n')
  })
})

test('on focus a clean external tab reloads; a deleted file is marked, kept, and recreated on save', async ({
  slate,
  page,
}) => {
  const file = await openExternal(page, slate.app, 'live.md', 'v1\n')
  await writeFile(file, 'v2 from outside\n')
  await refocus(page)
  await expect.poll(() => editorDoc(page)).toBe('v2 from outside\n')
  await expect(tab(page, 'live').getByRole('img', { name: 'Unsaved changes' })).toBeHidden()

  await unlink(file)
  await refocus(page)
  await expect(tab(page, 'live').getByRole('img', { name: 'Deleted on disk' })).toBeVisible()
  expect(await editorDoc(page)).toBe('v2 from outside\n')

  // Editing (auto-save) recreates the file and clears the mark.
  await editor(page).click()
  await page.keyboard.press('Control+End')
  await page.keyboard.type('back')
  await expect.poll(() => existsSync(file), { timeout: 10_000 }).toBe(true)
  expect(await read(file)).toBe('v2 from outside\nback')
  await expect(tab(page, 'live').getByRole('img', { name: 'Deleted on disk' })).toBeHidden()
})

test('a vault note edited by another program also prompts instead of being overwritten', async ({
  page,
  vault,
}) => {
  await openNote(page, 'Welcome')
  await vault.write('Welcome.md', '# Welcome\n\nEdited in another editor.\n')

  await page.keyboard.press('Control+End')
  await page.keyboard.type('slate edit')
  await expect(conflictDialog(page)).toBeVisible({ timeout: 10_000 })
  expect(await vault.read('Welcome.md')).toBe('# Welcome\n\nEdited in another editor.\n')

  await conflictDialog(page).getByRole('button', { name: 'Overwrite', exact: true }).click()
  await expect.poll(() => vault.read('Welcome.md')).toContain('slate edit')
  expect(await vault.read('Welcome.md')).not.toContain('Edited in another editor')

  // Clean vault tabs also pick up outside edits on focus.
  await vault.write('Welcome.md', '# Welcome\n\nNewer outside version.\n')
  await refocus(page)
  await expect.poll(() => editorDoc(page)).toBe('# Welcome\n\nNewer outside version.\n')
})

/** Blur then focus the window, as alt-tabbing away and back does. */
async function blurAndFocus(page: Page): Promise<void> {
  await page.evaluate(() => window.dispatchEvent(new Event('blur')))
  await refocus(page)
}

const dirtyDot = (page: Page, label: string) =>
  tab(page, label).getByRole('img', { name: 'Unsaved changes' })

test.describe('CRLF files (Windows line endings)', () => {
  test.describe('auto-save off', () => {
    test.use({
      settings: { autoSave: false },
      vaultFiles: { 'Crlf.md': '# Crlf\r\n\r\nfirst line\r\n' },
    })

    test('vault note: focus is a no-op, a clean outside edit reloads clean, Ctrl+S has no false conflict', async ({
      page,
      vault,
    }) => {
      await openNote(page, 'Crlf')
      for (let i = 0; i < 3; i++) await blurAndFocus(page)
      await page.waitForTimeout(500)
      await expect(conflictDialog(page)).toBeHidden()
      await expect(dirtyDot(page, 'Crlf')).toBeHidden()
      expect(await vault.read('Crlf.md')).toBe('# Crlf\r\n\r\nfirst line\r\n')

      // Outside edit (still CRLF) on a clean tab: reloads and stays clean, no write-back.
      await vault.write('Crlf.md', '# Crlf\r\n\r\nedited outside\r\n')
      await blurAndFocus(page)
      await expect.poll(() => editorDoc(page)).toBe('# Crlf\n\nedited outside\n')
      await blurAndFocus(page)
      await page.waitForTimeout(500)
      await expect(dirtyDot(page, 'Crlf')).toBeHidden()
      expect(await vault.read('Crlf.md')).toBe('# Crlf\r\n\r\nedited outside\r\n')

      await editor(page).click()
      await page.keyboard.press('Control+End')
      await page.keyboard.type('typed')
      await page.keyboard.press('Control+s')
      await expect(dirtyDot(page, 'Crlf')).toBeHidden()
      await expect(conflictDialog(page)).toBeHidden()
      // Vault notes are saved as the editor's LF text (unchanged behaviour).
      expect(await vault.read('Crlf.md')).toBe('# Crlf\n\nedited outside\ntyped')
    })

    test('external file: focus is a no-op, Ctrl+S has no false conflict and keeps CRLF', async ({
      slate,
      page,
    }) => {
      const file = join(outside, 'win.md')
      await writeFile(file, '# Win\r\n\r\nalpha\r\n')
      await openViaSecondInstance(slate.app, [file])
      await expect(editor(page)).toContainText('alpha')
      for (let i = 0; i < 3; i++) await blurAndFocus(page)
      await page.waitForTimeout(500)
      await expect(conflictDialog(page)).toBeHidden()
      await expect(dirtyDot(page, 'win')).toBeHidden()

      await editor(page).click()
      await page.keyboard.press('Control+End')
      await page.keyboard.type('beta')
      await page.keyboard.press('Control+s')
      await expect(dirtyDot(page, 'win')).toBeHidden()
      await expect(conflictDialog(page)).toBeHidden()
      expect(await read(file)).toBe('# Win\r\n\r\nalpha\r\nbeta')
      await blurAndFocus(page)
      await page.waitForTimeout(500)
      await expect(dirtyDot(page, 'win')).toBeHidden()
    })
  })

  test.describe('auto-save on', () => {
    test.use({ vaultFiles: { 'Crlf.md': '# Crlf\r\n\r\nfirst line\r\n' } })

    test('vault note and external file auto-save without a conflict prompt', async ({
      slate,
      page,
      vault,
    }) => {
      await openNote(page, 'Crlf')
      await blurAndFocus(page)
      await page.keyboard.press('Control+End')
      await page.keyboard.type('auto')
      await expect.poll(() => vault.read('Crlf.md'), { timeout: 10_000 }).toContain('auto')
      await page.keyboard.type(' again')
      await expect.poll(() => vault.read('Crlf.md'), { timeout: 10_000 }).toContain('auto again')
      await expect(conflictDialog(page)).toBeHidden()

      const file = join(outside, 'auto.md')
      await writeFile(file, 'one\r\ntwo\r\n')
      await openViaSecondInstance(slate.app, [file])
      await expect(editor(page)).toContainText('two')
      await blurAndFocus(page)
      await editor(page).click()
      await page.keyboard.press('Control+End')
      await page.keyboard.type('three')
      await expect.poll(() => read(file), { timeout: 10_000 }).toBe('one\r\ntwo\r\nthree')
      await page.keyboard.type('!')
      await expect.poll(() => read(file), { timeout: 10_000 }).toBe('one\r\ntwo\r\nthree!')
      await expect(conflictDialog(page)).toBeHidden()
      await expect(dirtyDot(page, 'auto')).toBeHidden()
    })
  })
})
