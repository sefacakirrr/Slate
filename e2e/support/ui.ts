import { expect, type Locator, type Page } from '@playwright/test'

/**
 * Reusable UI helpers for Slate specs. Locate by role/accessible name (what a
 * user perceives); scope sidebar lookups to `sidebar(page)` because the content
 * pane also shows buttons named after the open note.
 */

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The left sidebar (note tree, Trash view, calendar). */
export function sidebar(page: Page): Locator {
  return page.getByRole('complementary', { name: 'Sidebar' })
}

/**
 * The sidebar row button that opens a note (label = filename without
 * extension). A locked note's button is named "Locked <label>".
 */
export function noteButton(page: Page, label: string): Locator {
  return sidebar(page).getByRole('button', { name: new RegExp(`^(Locked )?${escapeRe(label)}$`) })
}

/** The sidebar row button that expands/collapses a folder (by its leaf name). */
export function folderButton(page: Page, name: string): Locator {
  return sidebar(page).getByRole('button', { name, exact: true })
}

/** Creates a root-level note through the sidebar "New note" button; the note opens. */
export async function createNoteViaSidebar(page: Page, label: string): Promise<void> {
  await sidebar(page).getByRole('button', { name: 'New note', exact: true }).click()
  const nameInput = sidebar(page).getByRole('textbox', { name: 'New note name' })
  await nameInput.fill(label)
  await nameInput.press('Enter')
  await expect(noteButton(page, label)).toBeVisible()
}

/** The CodeMirror editor of the active note. */
export function editor(page: Page): Locator {
  return page.locator('.cm-content').first()
}

/** Deletes a note via its hover-revealed sidebar button and confirms the dialog. */
export async function deleteNoteViaSidebar(page: Page, label: string): Promise<void> {
  await noteButton(page, label).hover()
  await sidebar(page)
    .getByRole('button', { name: `Delete ${label}`, exact: true })
    .click()
  const dialog = page.getByRole('dialog', { name: 'Delete note' })
  await dialog.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(dialog).toBeHidden()
}

/** Deletes a folder via its hover-revealed sidebar button and confirms the dialog. */
export async function deleteFolderViaSidebar(page: Page, name: string): Promise<void> {
  const toggle = folderButton(page, name)
  await toggle.hover()
  // The folder row's hover actions sit next to its toggle button.
  await toggle.locator('..').getByTitle('Delete folder').click()
  const dialog = page.getByRole('dialog', { name: 'Delete folder' })
  await dialog.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(dialog).toBeHidden()
}

/** Toggles the sidebar between the note tree and the Trash view. */
export async function toggleTrashView(page: Page): Promise<void> {
  await sidebar(page).getByRole('button', { name: 'Trash', exact: true }).click()
}

/** A row in the Trash view: the innermost element holding `name` and a Restore button. */
export function trashRow(page: Page, name: string): Locator {
  return sidebar(page)
    .locator('div')
    .filter({ has: page.getByText(name, { exact: true }) })
    .filter({ has: page.getByRole('button', { name: 'Restore' }) })
    .last()
}

/** The bottom delete/undo toast. */
export function trashToast(page: Page): Locator {
  return page.getByRole('status').filter({ hasText: /Moved|Couldn't delete/ })
}

// ---------------------------------------------------------------------------
// Editor helpers (CodeMirror 6). The live EditorView hangs off the content DOM
// as `cmTile.view` (`cmView.view` in older @codemirror/view). Reading and
// dispatching through it is how specs observe the exact document text (hidden
// markers included) and place a precise selection.
// ---------------------------------------------------------------------------

/** The slice of CodeMirror's EditorView the helpers use. */
type CmView = {
  state: {
    doc: { toString(): string }
    selection: { main: { from: number; to: number } }
  }
  dom: HTMLElement
  focus(): void
  dispatch(spec: unknown): void
}
type CmHost = { cmTile?: { view?: CmView }; cmView?: { view?: CmView } }

/** Opens a note from the sidebar and waits for the editor to show it. */
export async function openNote(page: Page, label: string): Promise<void> {
  await noteButton(page, label).click()
  await expect(editor(page)).toBeVisible()
  await editor(page).click()
}

/** The active editor's full document text (raw markdown, markers included). */
export function editorDoc(page: Page): Promise<string> {
  return page.evaluate(() => {
    const host = document.querySelector('.cm-content') as unknown as CmHost | null
    const view = (host?.cmTile?.view ?? host?.cmView?.view) as CmView
    return view ? (view.state.doc.toString() as string) : ''
  })
}

/** The text a user sees in the editor (hidden markers are not in the DOM). */
export function editorVisibleText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const lines = Array.from(document.querySelectorAll('.cm-content .cm-line'))
    return lines.map((l) => (l as HTMLElement).innerText).join('\n')
  })
}

/** The main selection `{ from, to }` of the active editor. */
export function editorSelection(page: Page): Promise<{ from: number; to: number }> {
  return page.evaluate(() => {
    const host = document.querySelector('.cm-content') as unknown as CmHost | null
    const view = (host?.cmTile?.view ?? host?.cmView?.view) as CmView
    const { from, to } = view.state.selection.main
    return { from, to }
  })
}

/**
 * Selects `[from, to)` in the active editor (or the `nth` occurrence of a
 * string), then fires a keyup so the selection toolbar reacts like it does
 * after a real Shift+Arrow selection.
 */
export async function selectInEditor(
  page: Page,
  target: string | { from: number; to: number },
  nth = 0,
): Promise<void> {
  await page.evaluate(
    ({ target, nth }) => {
      const host = document.querySelector('.cm-content') as unknown as CmHost | null
      const view = (host?.cmTile?.view ?? host?.cmView?.view) as CmView
      let from: number
      let to: number
      if (typeof target === 'string') {
        const doc: string = view.state.doc.toString()
        let idx = -1
        for (let i = 0; i <= nth; i++) idx = doc.indexOf(target, idx + 1)
        if (idx === -1) throw new Error(`"${target}" not in editor doc: ${JSON.stringify(doc)}`)
        from = idx
        to = idx + target.length
      } else {
        from = target.from
        to = target.to
      }
      view.focus()
      view.dispatch({ selection: { anchor: from, head: to } })
      view.dom.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Shift' }))
    },
    { target, nth },
  )
}

/** Puts the caret at `pos` (or before the `nth` occurrence of a string). */
export async function caretInEditor(page: Page, target: string | number, nth = 0): Promise<void> {
  await page.evaluate(
    ({ target, nth }) => {
      const host = document.querySelector('.cm-content') as unknown as CmHost | null
      const view = (host?.cmTile?.view ?? host?.cmView?.view) as CmView
      let pos = typeof target === 'number' ? target : -1
      if (typeof target === 'string') {
        const doc: string = view.state.doc.toString()
        for (let i = 0; i <= nth; i++) pos = doc.indexOf(target, pos + 1)
        if (pos === -1) throw new Error(`"${target}" not in editor doc: ${JSON.stringify(doc)}`)
      }
      view.focus()
      view.dispatch({ selection: { anchor: pos } })
    },
    { target, nth },
  )
}

/** The floating selection toolbar. */
export function formatToolbar(page: Page): Locator {
  return page.getByRole('toolbar')
}

/** Raw marker syntax that must never be visible to the user in a rendered markdown note. */
export const RAW_MARKER_RE =
  /\*\*|\+\+|~~|==|\{\.\w+\}|\{\/?color(:\w+)?\}|\{\/?size(:\d+)?\}|\{align:\w+\}/

/** Writes `text` to the OS clipboard (main process) — then press Ctrl+V. */
export async function setClipboardText(
  app: import('@playwright/test').ElectronApplication,
  text: string,
): Promise<void> {
  await app.evaluate(({ clipboard }, t) => clipboard.writeText(t), text)
}

// ── QA3 helpers: search, settings, calendar, secondary windows ───────────────

/** The Ctrl+Shift+F search overlay. */
export function searchDialog(page: Page): Locator {
  return page.getByRole('dialog', { name: 'Search notes' })
}

/** Opens the settings panel (it replaces the sidebar's content). */
export async function openSettings(page: Page): Promise<void> {
  await sidebar(page).getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(sidebar(page).getByRole('heading', { name: 'Settings' })).toBeVisible()
}

/** Waits for the next BrowserWindow whose URL hash starts with `hashPrefix` (e.g. `#/capture`). */
export async function waitForWindow(
  app: import('@playwright/test').ElectronApplication,
  hashPrefix: string,
  timeoutMs = 15_000,
): Promise<Page> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    for (const w of app.windows()) {
      const hash = new URL(w.url()).hash
      if (hash.startsWith(hashPrefix)) {
        await w.waitForLoadState('domcontentloaded')
        return w
      }
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error(`no window with hash ${hashPrefix}`)
}

// ── Vault / tabs / locked-note helpers (QA pass 2026-10) ─────────────────────

/** Clicks a hover-revealed action button on a note's sidebar row (e.g. `Rename`, `Lock`, `Unlock`). */
export async function noteRowAction(
  page: Page,
  label: string,
  action: 'Rename' | 'Lock' | 'Unlock' | 'Delete',
): Promise<void> {
  await noteButton(page, label).hover()
  await sidebar(page)
    .getByRole('button', { name: `${action} ${label}`, exact: true })
    .click()
}

/** Starts an inline rename of a note, types `newName` and presses Enter. */
export async function renameNoteViaSidebar(
  page: Page,
  label: string,
  newName: string,
): Promise<void> {
  await noteRowAction(page, label, 'Rename')
  const input = sidebar(page).getByRole('textbox', { name: 'New note name' })
  await input.fill(newName)
  await input.press('Enter')
}

/** Clicks a folder row's hover action (`New note here`, `New subfolder`, `Delete folder`). */
export async function folderRowAction(
  page: Page,
  name: string,
  title: 'New note here' | 'New subfolder' | 'Rename folder' | 'Delete folder',
): Promise<void> {
  const toggle = folderButton(page, name)
  await toggle.hover()
  await toggle.locator('..').getByTitle(title, { exact: true }).click()
}

/** Starts an inline rename of a folder, types `newName` and presses Enter. */
export async function renameFolderViaSidebar(
  page: Page,
  name: string,
  newName: string,
): Promise<void> {
  await folderRowAction(page, name, 'Rename folder')
  const input = sidebar(page).getByRole('textbox', { name: 'New folder name' })
  await input.fill(newName)
  await input.press('Enter')
}

/** An open tab in the tab bar, by its label (filename without extension). */
export function tabFor(page: Page, label: string): Locator {
  return page
    .getByRole('tab')
    .filter({ has: page.getByRole('button', { name: `Close ${label}`, exact: true }) })
}

/** Labels of the open tabs, in order. */
export async function tabLabels(page: Page): Promise<string[]> {
  const closes = await page
    .getByRole('tab')
    .getByRole('button', { name: /^Close / })
    .all()
  return Promise.all(
    closes.map(async (b) => ((await b.textContent()) ?? '').replace(/^Close /, '')),
  )
}

/** The unsaved-changes dot inside a tab. */
export function dirtyDot(tab: Locator): Locator {
  return tab.getByLabel('Unsaved changes')
}

/** Types into the active editor at the end of the document. */
export async function typeInEditor(page: Page, text: string): Promise<void> {
  await editor(page).click()
  await page.keyboard.press('Control+End')
  await page.keyboard.type(text)
}

/** The per-note error/notice toast (rename/move/lock failures). */
export function noticeToast(page: Page): Locator {
  return page.getByRole('alert').filter({ hasText: /\S/ })
}

/** The vault password dialog (set or unlock mode). */
export function passwordDialog(page: Page): Locator {
  return page.getByRole('dialog', { name: /^(Set vault password|Unlock vault)$/ })
}

/** Completes the first-time "Set vault password" dialog. */
export async function setVaultPassword(page: Page, password: string, hint?: string): Promise<void> {
  const dialog = page.getByRole('dialog', { name: 'Set vault password' })
  await dialog.getByPlaceholder('Vault password').fill(password)
  await dialog.getByPlaceholder('Confirm password').fill(password)
  if (hint !== undefined) await dialog.getByPlaceholder('Password hint (optional)').fill(hint)
  await dialog.getByRole('checkbox').check()
  await dialog.getByRole('button', { name: 'Set password' }).click()
  await expect(dialog).toBeHidden()
}

/** Enters the password into the "Unlock vault" dialog and submits it. */
export async function submitUnlock(page: Page, password: string): Promise<void> {
  const dialog = page.getByRole('dialog', { name: 'Unlock vault' })
  await dialog.getByPlaceholder('Vault password').fill(password)
  await dialog.getByRole('button', { name: 'Unlock', exact: true }).click()
}
