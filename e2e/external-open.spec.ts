import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron } from '@playwright/test'
import type { Api } from '../src/shared/ipc'
import { type ElectronApplication, expect, type Page, test } from './fixtures'
import { REPO_ROOT } from './support/paths'

/**
 * Opening files from outside the app ("Open with", double-click, argv). A real
 * second launch can't be driven from Playwright, so these emit the main
 * process's `second-instance` event with an argv shaped like the OS would pass
 * (dev/E2E: [electron, appDir, file]) — the same code path a second Slate.exe
 * takes. Drag & drop needs real OS File objects (`webUtils.getPathForFile`),
 * so only its security boundary is covered here.
 */

let outside: string

test.beforeEach(async () => {
  outside = await mkdtemp(join(tmpdir(), 'slate-e2e-external-'))
})

test.afterEach(async () => {
  await rm(outside, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
})

/** Simulates `Slate.exe <paths>` while Slate is already running. */
async function openViaSecondInstance(app: ElectronApplication, paths: string[]): Promise<void> {
  await app.evaluate(
    ({ app: a }, args) => {
      a.emit('second-instance', {}, ['electron.exe', '.', ...args.paths], args.cwd, {})
    },
    { paths, cwd: outside },
  )
}

/** The CodeMirror editor of the active tab. */
function editor(page: Page) {
  return page.locator('.cm-content').first()
}

function tab(page: Page, label: string) {
  return page.getByRole('tab').filter({ hasText: label })
}

const BOM = Buffer.from([0xef, 0xbb, 0xbf])

test('an outside file opens as an external tab and saves in place with BOM + CRLF kept', async ({
  slate,
  page,
}) => {
  const file = join(outside, 'shopping.md')
  await writeFile(file, Buffer.concat([BOM, Buffer.from('# Shopping\r\n\r\n- milk\r\n')]))

  await openViaSecondInstance(slate.app, [file])

  await expect(tab(page, 'shopping')).toBeVisible()
  await expect(tab(page, 'shopping').getByRole('button').first()).toHaveAttribute('title', file)
  await expect(page.getByText('External', { exact: true })).toBeVisible()
  await expect(editor(page)).toContainText('- milk')
  // The BOM is stripped for display.
  expect(await editor(page).innerText()).not.toContain(String.fromCharCode(0xfeff))

  await editor(page).click()
  await page.keyboard.press('Control+End')
  await page.keyboard.type('- eggs')
  // Auto-save (on by default) writes back to the original file.
  await expect
    .poll(async () => (await readFile(file)).toString('utf-8'), { timeout: 15_000 })
    .toContain('- eggs')
  const saved = await readFile(file)
  expect(saved.subarray(0, 3).equals(BOM)).toBe(true)
  expect(saved.subarray(3).toString('utf-8')).toBe('# Shopping\r\n\r\n- milk\r\n- eggs')

  // Opening the same file again focuses the existing tab instead of duplicating it.
  await openViaSecondInstance(slate.app, [file])
  await expect(tab(page, 'shopping')).toHaveCount(1)
})

test('a file inside the vault opens as the normal vault note tab', async ({
  slate,
  page,
  vault,
}) => {
  await openViaSecondInstance(slate.app, [vault.abs('Projects/Plan.md')])
  await expect(tab(page, 'Plan')).toBeVisible()
  await expect(tab(page, 'Plan').getByRole('button').first()).toHaveAttribute(
    'title',
    'Projects/Plan.md',
  )
  await expect(page.getByText('External', { exact: true })).toBeHidden()
  await expect(editor(page)).toContainText('first task')
})

test('several files open as several tabs; a .txt opens as plain text', async ({ slate, page }) => {
  const a = join(outside, 'alpha.txt')
  const b = join(outside, 'beta.markdown')
  await writeFile(a, '- [ ] not a checkbox in txt\n')
  await writeFile(b, '# Beta\n')
  await openViaSecondInstance(slate.app, [a, b])
  await expect(tab(page, 'alpha')).toBeVisible()
  await expect(tab(page, 'beta')).toBeVisible()
  await tab(page, 'alpha').getByRole('button').first().click()
  await expect(editor(page)).toContainText('- [ ] not a checkbox in txt')
  await expect(page.locator('.cm-content input[type="checkbox"]')).toHaveCount(0)
})

test('a binary file is rejected with a toast (size/encoding limits: unit tests)', async ({
  slate,
  page,
}) => {
  const bin = join(outside, 'blob.md')
  await writeFile(bin, Buffer.from([0x23, 0x00, 0x01, 0x02]))
  await openViaSecondInstance(slate.app, [bin])
  await expect(page.getByRole('alert')).toContainText("Couldn't open")
  await expect(page.getByRole('alert')).toContainText('binary')
  await expect(tab(page, 'blob')).toHaveCount(0)
})

test('external tabs are restored after a restart', async ({ slate }) => {
  const file = join(outside, 'keep.md')
  await writeFile(file, 'kept across restarts\n')
  await openViaSecondInstance(slate.app, [file])
  await expect(tab(slate.page, 'keep')).toBeVisible()

  const page = await slate.restart()
  await expect(tab(page, 'keep')).toBeVisible()
  await tab(page, 'keep').getByRole('button').first().click()
  await expect(editor(page)).toContainText('kept across restarts')
})

test('the renderer cannot read or write files the user never opened', async ({ page }) => {
  const secret = join(outside, 'secret.md')
  await writeFile(secret, 'top secret\n')
  const result = await page.evaluate(async (p) => {
    const read = await (window as unknown as { api: Api }).api.external.read(p)
    const write = await (window as unknown as { api: Api }).api.external.write({
      path: p,
      content: 'pwned',
    })
    // A File built by page script has no on-disk path, so a forged drop opens nothing.
    const dropped = await (window as unknown as { api: Api }).api.external.openDropped([
      new File(['x'], p),
    ])
    return { read, write, dropped }
  }, secret)
  expect(result.read).toEqual({ ok: false, error: 'not-allowed' })
  expect(result.write).toEqual({ ok: false, error: 'not-allowed' })
  expect(result.dropped).toEqual({ ok: true, data: [] })
  expect(await readFile(secret, 'utf-8')).toBe('top secret\n')
})

test('dropping a file onto the window never navigates away from the app', async ({ page }) => {
  const before = page.url()
  await page.evaluate(() => {
    const dt = new DataTransfer()
    dt.items.add(new File(['# dropped'], 'dropped.md', { type: 'text/markdown' }))
    const target = document.body
    target.dispatchEvent(
      new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }),
    )
    target.dispatchEvent(
      new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }),
    )
  })
  await page.waitForTimeout(500)
  expect(page.url()).toBe(before)
  await expect(page.getByRole('tab').filter({ hasText: 'dropped' })).toHaveCount(0)
})

test('a cold start with a file argument opens it, shows the window even with --hidden, and works with no vault', async () => {
  test.skip(process.env.SLATE_E2E_OUT !== undefined, 'launches the default out/ build directly')
  const file = join(outside, 'cold.txt')
  await writeFile(file, 'opened at launch\r\n')
  const userData = join(outside, 'userData')
  await mkdir(userData, { recursive: true })
  // No vaultPath: external files still open without a vault.
  await writeFile(
    join(userData, 'settings.json'),
    JSON.stringify({ closeToTray: false, launchAtLogin: false }),
  )
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v
  delete env.ELECTRON_RUN_AS_NODE
  delete env.ELECTRON_RENDERER_URL
  env.SLATE_E2E_USER_DATA = userData

  const app = await electron.launch({ args: [REPO_ROOT, '--hidden', file], env, timeout: 60_000 })
  try {
    const page = await app.firstWindow()
    await expect(tab(page, 'cold')).toBeVisible({ timeout: 30_000 })
    await expect(editor(page)).toContainText('opened at launch')
    expect(
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible()),
    ).toBe(true)
  } finally {
    await app.evaluate(({ app: a }) => setImmediate(() => a.exit(0))).catch(() => undefined)
    await app.close().catch(() => undefined)
  }
})
