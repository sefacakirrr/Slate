import { expect, type Page, test } from './fixtures'
import { caretInEditor, editor, editorDoc, editorSelection, openNote } from './support/ui'

const LONG = `LONG ${'lorem ipsum dolor sit amet '.repeat(8)}END`

test.use({
  settings: { autoSave: false },
  vaultFiles: {
    'Tasks.md': '# Tasks\n- [ ] one\n- [ ] two\n- [ ] three\n\nafter\n',
    'Single.md': '- [ ] alone\n',
    'Fold.md': `first\nsecond\n${LONG}\nlast\n`,
    'Find.md': 'alpha beta\ngamma beta\n',
    'Pic.md': 'top\n![pic](_attachments/pic.png)\nbottom\n',
    'Chip.md': 'see\n[report.pdf](_attachments/report.pdf)\nend\n',
    'Inline.md':
      'see ![x](_attachments/a.png) here\n```html\n<img src="a.png" />\n- [ ] in code\n```\n',
    '_attachments/report.pdf': '%PDF-1.4 tiny',
  },
})

const TIMESTAMP = / ✓ \d{2}\.\d{2}\.\d{4} \d{2}:\d{2}$/

function checkbox(page: Page, nth: number) {
  return page.locator('.cm-checkbox-widget').nth(nth)
}

test('checking a task stamps it and moves it to the bottom of its block; unchecking reverts', async ({
  page,
}) => {
  await openNote(page, 'Tasks')
  await expect(page.locator('.cm-checkbox-widget')).toHaveCount(3)
  // Check "one" (first): it goes to the bottom, unchecked ones stay on top.
  await checkbox(page, 0).dispatchEvent('mousedown')
  let lines = (await editorDoc(page)).split('\n')
  expect(lines.slice(1, 4).map((l) => l.replace(TIMESTAMP, ''))).toEqual([
    '- [ ] two',
    '- [ ] three',
    '- [x] one',
  ])
  expect(lines[3]).toMatch(TIMESTAMP)
  await expect(page.locator('.cm-task-checked')).toHaveCount(1)
  await expect(page.locator('.cm-task-timestamp')).toHaveCount(1)

  // Check "three" (now second): it joins the done items at the bottom.
  await checkbox(page, 1).dispatchEvent('mousedown')
  lines = (await editorDoc(page)).split('\n')
  expect(lines.slice(1, 4).map((l) => l.replace(TIMESTAMP, ''))).toEqual([
    '- [ ] two',
    '- [x] three',
    '- [x] one',
  ])

  // Uncheck "one" (last): timestamp removed, back above the done items.
  await checkbox(page, 2).dispatchEvent('mousedown')
  lines = (await editorDoc(page)).split('\n')
  expect(lines.slice(1, 4)).toEqual([
    '- [ ] two',
    '- [ ] one',
    expect.stringMatching(/^- \[x\] three ✓/),
  ])
  expect(lines[4]).toBe('')
  expect(lines[5]).toBe('after')

  // Each toggle is its own undo step, even when clicked in quick succession.
  await editor(page).focus()
  await page.keyboard.press('Control+z')
  await expect
    .poll(async () =>
      (await editorDoc(page))
        .split('\n')
        .slice(1, 4)
        .map((l) => l.replace(TIMESTAMP, '')),
    )
    .toEqual(['- [ ] two', '- [x] three', '- [x] one'])
  await page.keyboard.press('Control+z')
  await page.keyboard.press('Control+z')
  await expect
    .poll(() => editorDoc(page))
    .toBe('# Tasks\n- [ ] one\n- [ ] two\n- [ ] three\n\nafter\n')
})

test('a single task toggles in place with a timestamp', async ({ page }) => {
  await openNote(page, 'Single')
  await checkbox(page, 0).dispatchEvent('mousedown')
  await expect
    .poll(() => editorDoc(page))
    .toMatch(/^- \[x\] alone ✓ \d{2}\.\d{2}\.\d{4} \d{2}:\d{2}\n$/)
  await checkbox(page, 0).dispatchEvent('mousedown')
  await expect.poll(() => editorDoc(page)).toBe('- [ ] alone\n')
})

test('the toolbar checklist button turns lines into tasks and back', async ({ page }) => {
  await openNote(page, 'Find')
  await page.keyboard.press('Control+a')
  await page.locator('.cm-content').dispatchEvent('keyup')
  await page.getByRole('toolbar').getByTitle('Toggle checklist').click()
  await expect.poll(() => editorDoc(page)).toBe('- [ ] alpha beta\n- [ ] gamma beta\n')
  await expect(page.locator('.cm-checkbox-widget')).toHaveCount(2)
})

test('a long line folds and unfolds; the fold follows the line when lines are added above', async ({
  page,
}) => {
  await openNote(page, 'Fold')
  const chevrons = page.locator('.cm-linefold-chevron')
  await expect(chevrons).toHaveCount(1)
  await chevrons.first().dispatchEvent('mousedown')
  const ellipsis = page.locator('.cm-linefold-ellipsis')
  await expect(ellipsis).toHaveCount(1)
  await expect(page.locator('.cm-line', { hasText: 'LONG' })).not.toContainText('END')

  // Add a line above the folded one: it must stay folded (and nothing else may fold).
  await caretInEditor(page, 'second')
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await page.keyboard.type('inserted')
  await expect(ellipsis).toHaveCount(1)
  await expect(page.locator('.cm-line', { hasText: 'LONG' })).not.toContainText('END')
  // Remove lines above it again.
  await page.keyboard.press('Home')
  await page.keyboard.press('Shift+End')
  await page.keyboard.press('Backspace')
  await page.keyboard.press('Backspace')
  await expect(ellipsis).toHaveCount(1)
  await expect(page.locator('.cm-line', { hasText: 'LONG' })).not.toContainText('END')

  // Clicking the ellipsis expands it.
  await ellipsis.dispatchEvent('mousedown')
  await expect(ellipsis).toHaveCount(0)
  await expect(page.locator('.cm-line', { hasText: 'LONG' })).toContainText('END')
})

test('a folded line that gets deleted does not fold whatever line takes its place', async ({
  page,
}) => {
  await openNote(page, 'Fold')
  await page.locator('.cm-linefold-chevron').first().dispatchEvent('mousedown')
  await expect(page.locator('.cm-linefold-ellipsis')).toHaveCount(1)
  // Delete the folded line entirely, then make the line now at its number long.
  await caretInEditor(page, 'LONG')
  await page.keyboard.press('Shift+ArrowDown')
  await page.keyboard.press('Backspace')
  await expect.poll(() => editorDoc(page)).toBe('first\nsecond\nlast\n')
  await caretInEditor(page, 'last')
  await page.keyboard.press('End')
  await page.keyboard.type(' x'.repeat(60))
  await expect(page.locator('.cm-linefold-ellipsis')).toHaveCount(0)
})

test('Ctrl+F opens find and Enter selects the next match', async ({ page }) => {
  await openNote(page, 'Find')
  await caretInEditor(page, 0)
  await page.keyboard.press('Control+f')
  const search = page.locator('.cm-search input[name="search"]')
  await expect(search).toBeFocused()
  await search.pressSequentially('beta')
  await search.press('Enter')
  expect(await editorSelection(page)).toEqual({ from: 6, to: 10 })
  await search.press('Enter')
  expect(await editorSelection(page)).toEqual({ from: 17, to: 21 })
  await search.press('Escape')
  await expect(page.locator('.cm-search')).toHaveCount(0)
})

test('auto-save off: edits stay unsaved until Ctrl+S', async ({ page, vault }) => {
  await openNote(page, 'Find')
  await page.keyboard.press('Control+End')
  await page.keyboard.type('typed')
  await page.waitForTimeout(2500)
  expect(await vault.read('Find.md')).toBe('alpha beta\ngamma beta\n')
  await page.keyboard.press('Control+s')
  await expect.poll(() => vault.read('Find.md')).toBe('alpha beta\ngamma beta\ntyped')
})

async function seedPng(slate: import('./fixtures').Slate, rel: string, w: number, h: number) {
  const b64 = await slate.app.evaluate(
    ({ nativeImage }, size) => {
      const buf = Buffer.alloc(size.w * size.h * 4, 0x80)
      return nativeImage
        .createFromBitmap(buf, { width: size.w, height: size.h })
        .toPNG()
        .toString('base64')
    },
    { w, h },
  )
  await slate.vault.write(rel, Buffer.from(b64, 'base64'))
}

test('image widget: renders, resizes by drag, double-click resets, × removes', async ({
  page,
  slate,
}) => {
  await seedPng(slate, '_attachments/pic.png', 400, 200)
  await openNote(page, 'Pic')
  const img = page.locator('.cm-image-widget img')
  await expect(img).toBeVisible()
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(400)

  // Drag the bottom-right handle 150px to the left.
  const frame = page.locator('.cm-image-frame')
  await frame.hover()
  const handle = page.locator('.cm-image-resize')
  await expect(handle).toHaveCSS('opacity', '1')
  const box = await handle.boundingBox()
  if (box === null) throw new Error('resize handle has no box')
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x - 75, y, { steps: 5 })
  await page.mouse.move(x - 150, y, { steps: 5 })
  await page.mouse.up()
  await expect
    .poll(() => editorDoc(page))
    .toMatch(/^top\n<img src="_attachments\/pic\.png" alt="pic" width="2\d\d" \/>\nbottom\n$/)
  const width = Number(/width="(\d+)"/.exec(await editorDoc(page))?.[1])
  expect(width).toBeGreaterThan(230)
  expect(width).toBeLessThan(270)
  await expect.poll(async () => Math.round((await img.boundingBox())?.width ?? 0)).toBe(width)

  // Double-click resets to natural size (markdown syntax).
  await img.dblclick()
  await expect.poll(() => editorDoc(page)).toBe('top\n![pic](_attachments/pic.png)\nbottom\n')

  // Undo the reset, then the resize.
  await editor(page).focus()
  await page.keyboard.press('Control+z')
  await expect.poll(() => editorDoc(page)).toContain('<img src=')
  await page.keyboard.press('Control+z')
  await expect.poll(() => editorDoc(page)).toBe('top\n![pic](_attachments/pic.png)\nbottom\n')

  // × removes the image line.
  await frame.hover()
  await page.locator('.cm-image-widget .cm-widget-delete').dispatchEvent('mousedown')
  await expect.poll(() => editorDoc(page)).toBe('top\nbottom\n')
  await expect(page.locator('.cm-image-widget')).toHaveCount(0)
})

test('a missing image shows a placeholder instead of a broken image', async ({ page }) => {
  await openNote(page, 'Pic')
  await expect(page.locator('.cm-image-widget')).toContainText('Image not found: pic')
})

test('typing on an image line goes to a new line below it', async ({ page, slate }) => {
  await seedPng(slate, '_attachments/pic.png', 40, 20)
  await openNote(page, 'Pic')
  await caretInEditor(page, '![pic]')
  await page.keyboard.type('xy')
  await expect.poll(() => editorDoc(page)).toBe('top\n![pic](_attachments/pic.png)\nxy\nbottom\n')
})

test('file chip: shows the name and opens the file with the OS', async ({ page, slate }) => {
  await slate.app.evaluate(({ shell }) => {
    const g = globalThis as unknown as { __opened: string[] }
    g.__opened = []
    shell.openPath = async (p: string) => {
      g.__opened.push(p)
      return ''
    }
  })
  await openNote(page, 'Chip')
  const chip = page.locator('.cm-file-widget')
  await expect(chip).toContainText('report.pdf')
  await expect(chip).toContainText('PDF')
  await chip.click()
  await expect
    .poll(() =>
      slate.app.evaluate(() => (globalThis as unknown as { __opened: string[] }).__opened),
    )
    .toEqual([slate.vault.abs('_attachments/report.pdf')])
  // × removes the chip's line.
  await chip.hover()
  await chip.locator('.cm-widget-delete').dispatchEvent('mousedown')
  await expect.poll(() => editorDoc(page)).toBe('see\nend\n')
})

test('a line with an inline image link (not a standalone image) stays editable', async ({
  page,
}) => {
  await openNote(page, 'Inline')
  await caretInEditor(page, '![x]')
  await page.keyboard.type('Z')
  await expect.poll(() => editorDoc(page)).toMatch(/^see Z!\[x\]\(_attachments\/a\.png\) here\n/)
})

test('code blocks stay verbatim: no checkbox widget, and <img> lines are editable', async ({
  page,
}) => {
  await openNote(page, 'Inline')
  await expect(page.locator('.cm-checkbox-widget')).toHaveCount(0)
  await expect(page.locator('.cm-line', { hasText: 'in code' })).toHaveText('- [ ] in code')
  await caretInEditor(page, '<img')
  await page.keyboard.type('Z')
  await expect.poll(() => editorDoc(page)).toContain('\nZ<img src="a.png" />\n')
})
