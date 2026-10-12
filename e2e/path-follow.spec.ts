import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ElectronApplication, Page } from './fixtures'
import { expect, test } from './fixtures'
import {
  editor,
  noteButton,
  renameFolderViaSidebar,
  renameNoteViaSidebar,
  sidebar,
  waitForWindow,
} from './support/ui'

/**
 * Reminders and sticky windows are keyed by vault-relative note path; they must
 * follow a note when it (or its folder) is renamed/moved, also across restarts.
 */

/** The preload API, as seen from a page script (results are IpcResults). */
type WithApi = {
  api: {
    vault: Record<string, (req: unknown) => Promise<{ ok: boolean; data?: string; error?: string }>>
  }
}

async function storedSettings(userDataDir: string): Promise<{
  reminders?: { id: string; notePath: string | null; fired: boolean }[]
  stickies?: { path: string }[]
}> {
  return JSON.parse(await readFile(join(userDataDir, 'settings.json'), 'utf-8'))
}

async function stickyUrls(app: ElectronApplication): Promise<string[]> {
  return app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .filter((w) => !w.isDestroyed() && w.webContents.getURL().includes('#/sticky/'))
      .map((w) => w.webContents.getURL()),
  )
}

async function pinSticky(page: Page, app: ElectronApplication, label: string): Promise<Page> {
  await noteButton(page, label).hover()
  await sidebar(page)
    .getByRole('button', { name: `Pin ${label} as sticky` })
    .click()
  const sticky = await waitForWindow(app, '#/sticky/')
  await expect(sticky.locator('.cm-content')).toBeVisible()
  return sticky
}

async function typeInSticky(sticky: Page, text: string): Promise<void> {
  await sticky.locator('.cm-content').click()
  await sticky.keyboard.press('Control+End')
  await sticky.keyboard.type(text)
}

test.describe('reminders follow a renamed note', () => {
  test.use({
    vaultFiles: { 'Welcome.md': '# Welcome\n', 'Notes/alpha.md': 'alpha body\n' },
    settings: {
      reminders: [
        {
          id: 'follow-1',
          title: 'Zeppelin check',
          notePath: 'Notes/alpha.md',
          fireAt: new Date(Date.now() + 60 * 60_000).toISOString(),
          alertBefore: 0,
          recurrence: 'none',
          fired: false,
          createdAt: Date.now(),
        },
      ],
    },
  })

  test('the reminder toast and notification open the note at its new path, after a restart', async ({
    slate,
    page,
  }) => {
    await renameNoteViaSidebar(page, 'alpha', 'beta')
    await expect(noteButton(page, 'beta')).toBeVisible()
    await expect
      .poll(async () => (await storedSettings(slate.userDataDir)).reminders?.[0]?.notePath)
      .toBe('Notes/beta.md')

    const page2 = await slate.restart()
    expect((await storedSettings(slate.userDataDir)).reminders?.[0]?.notePath).toBe('Notes/beta.md')

    // Make the reminder due: skew main's clock past fireAt and trigger a re-check.
    await slate.app.evaluate(({ Notification, powerMonitor }) => {
      const g = globalThis as unknown as { __shown: Electron.Notification[] }
      g.__shown = []
      Notification.prototype.show = function show(this: Electron.Notification) {
        g.__shown.push(this)
      }
      const real = Date.now
      Date.now = () => real() + 2 * 60 * 60_000
      powerMonitor.emit('resume')
    })

    const toast = page2.getByRole('button', { name: /Zeppelin check/ })
    await expect(toast).toBeVisible()
    await expect(toast).toContainText('Notes/beta.md')

    // The OS notification opens the renamed note.
    await noteButton(page2, 'Welcome').click()
    await expect(editor(page2)).toContainText('Welcome')
    await slate.app.evaluate(() => {
      const n = (globalThis as unknown as { __shown: Electron.Notification[] }).__shown[0]
      n.emit('click')
    })
    await expect(editor(page2)).toContainText('alpha body')

    // So does the in-app toast.
    await noteButton(page2, 'Welcome').click()
    await expect(editor(page2)).toContainText('Welcome')
    await toast.click()
    await expect(editor(page2)).toContainText('alpha body')
  })
})

test.describe('stickies follow their note', () => {
  test.use({
    vaultFiles: {
      'Welcome.md': '# Welcome\n',
      'Box/inside.md': 'sticky body\n',
      'Other/x.md': 'x\n',
      'solo.md': 'solo body\n',
    },
  })

  test('renaming the folder of a stuck note keeps the sticky open, saving to the new path', async ({
    slate,
    page,
    vault,
  }) => {
    const sticky = await pinSticky(page, slate.app, 'inside')
    await expect(sticky.locator('.cm-content')).toContainText('sticky body')

    await renameFolderViaSidebar(page, 'Box', 'Crate')
    await expect.poll(() => vault.exists('Crate/inside.md')).toBe(true)

    // Still open, same content, now keyed (and routed) by the new path.
    await expect
      .poll(() => stickyUrls(slate.app))
      .toEqual([expect.stringContaining('#/sticky/Crate%2Finside.md')])
    await expect(sticky.locator('.cm-content')).toContainText('sticky body')
    await expect
      .poll(async () => (await storedSettings(slate.userDataDir)).stickies?.map((s) => s.path))
      .toEqual(['Crate/inside.md'])

    await typeInSticky(sticky, ' after move')
    await expect.poll(() => vault.read('Crate/inside.md')).toContain('after move')
    expect(vault.exists('Box')).toBe(false)

    // Survives a restart: restored at the new path, and still saves there.
    await slate.restart()
    const restored = await waitForWindow(slate.app, '#/sticky/')
    await expect(restored.locator('.cm-content')).toContainText('after move')
    expect(await stickyUrls(slate.app)).toEqual([
      expect.stringContaining('#/sticky/Crate%2Finside.md'),
    ])
    await typeInSticky(restored, ' after restart')
    await expect.poll(() => vault.read('Crate/inside.md')).toContain('after restart')
    expect(vault.exists('Box')).toBe(false)
  })

  test('renaming a stuck note keeps the sticky on the renamed file', async ({
    slate,
    page,
    vault,
  }) => {
    const sticky = await pinSticky(page, slate.app, 'solo')
    await renameNoteViaSidebar(page, 'solo', 'duo')
    await expect.poll(() => vault.exists('duo.md')).toBe(true)
    await expect
      .poll(() => stickyUrls(slate.app))
      .toEqual([expect.stringContaining('#/sticky/duo.md')])
    await expect(sticky.locator('.cm-content')).toContainText('solo body')
    await typeInSticky(sticky, ' renamed')
    await expect.poll(() => vault.read('duo.md')).toContain('renamed')
    expect(vault.exists('solo.md')).toBe(false)
  })
})

test.describe('writes racing a move', () => {
  test.use({
    vaultFiles: { 'Welcome.md': '# Welcome\n', 'Box/inside.md': 'inside body\n' },
  })

  test('a note write for the old path, sent during or after a folder move, lands on the new path', async ({
    page,
    vault,
  }) => {
    // Both requests leave the renderer together: the write arrives mid-move.
    const results = await page.evaluate(() =>
      Promise.all([
        (window as unknown as WithApi).api.vault.renameFolder({ from: 'Box', to: 'Crate' }),
        (window as unknown as WithApi).api.vault.writeNote({
          path: 'Box/inside.md',
          content: 'raced write\n',
        }),
      ]),
    )
    expect(results.map((r) => r.ok)).toEqual([true, true])
    expect(await vault.read('Crate/inside.md')).toBe('raced write\n')
    expect(vault.exists('Box')).toBe(false)

    // A late write (sent before its window learned the new path) is redirected too.
    const late = await page.evaluate(() =>
      (window as unknown as WithApi).api.vault.writeNote({
        path: 'Box/inside.md',
        content: 'late write\n',
      }),
    )
    expect(late.ok).toBe(true)
    expect(await vault.read('Crate/inside.md')).toBe('late write\n')
    expect(vault.exists('Box')).toBe(false)
  })
})

test.describe('locking a stuck note', () => {
  test.use({
    vaultFiles: { 'Welcome.md': '# Welcome\n', 'secret.md': 'TOP SECRET\n' },
  })

  test('unsaved sticky edits are encrypted with the note and no plaintext is left on disk', async ({
    slate,
    page,
    vault,
  }) => {
    const set = await page.evaluate(() =>
      (window as unknown as WithApi).api.vault.setPassword({ password: 'pw-123456' }),
    )
    expect(set.ok).toBe(true)
    const sticky = await pinSticky(page, slate.app, 'secret')
    await expect(sticky.locator('.cm-content')).toContainText('TOP SECRET')

    // Type, then lock straight away — before the sticky's autosave and without
    // focusing the main window (no blur save): the edit only lives in the sticky.
    await typeInSticky(sticky, ' sticky-only edit')
    const locked = await page.evaluate(() =>
      (window as unknown as WithApi).api.vault.lockNote('secret.md'),
    )
    expect(locked.ok).toBe(true)

    await expect.poll(() => stickyUrls(slate.app)).toEqual([])
    expect(vault.exists('secret.md')).toBe(false)
    const cipher = (await vault.readBytes('secret.md.enc')).toString('latin1')
    expect(cipher).not.toContain('sticky-only')
    expect(cipher).not.toContain('TOP SECRET')
    const opened = await page.evaluate(() =>
      (window as unknown as WithApi).api.vault.readNote('secret.md.enc'),
    )
    expect(opened.ok && opened.data).toMatch(/TOP SECRET\s*sticky-only edit/)
    expect((await storedSettings(slate.userDataDir)).stickies ?? []).toEqual([])

    // Defence in depth: a late plaintext write for the locked note is refused.
    const leak = await page.evaluate(() =>
      (window as unknown as WithApi).api.vault.writeNote({
        path: 'secret.md',
        content: 'leaked\n',
      }),
    )
    expect(leak).toMatchObject({ ok: false, error: 'note-locked' })
    await page.waitForTimeout(1_000)
    expect(vault.exists('secret.md')).toBe(false)
  })
})
