import { expect, type Page, test } from './fixtures'
import {
  caretInEditor,
  editor,
  editorDoc,
  editorSelection,
  editorVisibleText,
  formatToolbar,
  noteButton,
  openNote,
  RAW_MARKER_RE,
  selectInEditor,
} from './support/ui'

const PLAIN = 'alpha beta gamma\nsecond line here\nthird line'

test.use({
  settings: { autoSave: false },
  vaultFiles: {
    'Plain.md': PLAIN,
    'Other.md': 'other note\n',
    'Rendered.md': [
      'b **bold** i _ital_ u ++under++ s ~~strike~~ c `code`',
      'h ==mark=={.yellow} t {color:red}red{/color} z {size:24}big{/size}',
      '{align:center}centered line',
      '{align:right}right line',
      '```js',
      'const a = "**not bold**"',
      '```',
    ].join('\n'),
    'Notes.txt': 'plain **text** _file_\n- [ ] not a widget\n',
  },
})

/** After undo the document must be exactly the original, with no raw markers visible. */
async function expectPristine(page: Page, original: string) {
  await expect.poll(() => editorDoc(page)).toBe(original)
  expect(await editorVisibleText(page)).not.toMatch(RAW_MARKER_RE)
  expect(await editorVisibleText(page)).toBe(original)
}

async function undo(page: Page) {
  await page.keyboard.press('Control+z')
}

test('every custom marker renders hidden with its style; code fences stay verbatim', async ({
  page,
}) => {
  await openNote(page, 'Rendered')
  const lines = page.locator('.cm-content .cm-line')
  await expect(lines.nth(0)).toHaveText('b bold i ital u under s strike c code')
  await expect(lines.nth(1)).toHaveText('h mark t red z big')
  await expect(lines.nth(2)).toHaveText('centered line')
  await expect(lines.nth(2)).toHaveCSS('text-align', 'center')
  await expect(lines.nth(3)).toHaveCSS('text-align', 'right')
  await expect(lines.nth(5)).toHaveText('const a = "**not bold**"')

  const styleOf = (text: string) =>
    lines.locator('span[style]', { hasText: new RegExp(`^${text}$`) }).first()
  await expect(styleOf('bold')).toHaveCSS('font-weight', '700')
  await expect(styleOf('ital')).toHaveCSS('font-style', 'italic')
  await expect(styleOf('under')).toHaveCSS('text-decoration-line', 'underline')
  await expect(styleOf('strike')).toHaveCSS('text-decoration-line', 'line-through')
  await expect(styleOf('big')).toHaveCSS('font-size', '24px')
  await expect(styleOf('red')).toHaveAttribute('style', /color:/)
  await expect(styleOf('mark')).toHaveAttribute('style', /background-color/)
})

// Inline markers DO render in .txt (highlightExtension is not markdown-gated by
// design, see findFencedCode); only markdown-only widgets are off.
test('.txt notes: task lines stay plain text (no checkbox widgets)', async ({ page }) => {
  await openNote(page, 'Notes')
  await expect(page.locator('.cm-content .cm-line').nth(1)).toHaveText('- [ ] not a widget')
  await expect(page.locator('.cm-checkbox-widget')).toHaveCount(0)
})

test('the toolbar appears on selection and hides when it collapses', async ({ page }) => {
  await openNote(page, 'Plain')
  await expect(formatToolbar(page)).toBeHidden()
  // A real keyboard selection.
  await page.keyboard.press('Control+Home')
  await page.keyboard.press('Shift+End')
  await expect(formatToolbar(page)).toBeVisible()
  await page.keyboard.press('ArrowRight')
  await expect(formatToolbar(page)).toBeHidden()
  // A real mouse selection (double-click a word).
  await page.locator('.cm-line', { hasText: 'second line here' }).dblclick()
  await expect(formatToolbar(page)).toBeVisible()
})

for (const [key, marker] of [
  ['Control+b', '**'],
  ['Control+i', '_'],
  ['Control+u', '++'],
] as const) {
  test(`${key} toggles ${marker} on, off, and undo/redo restore exactly`, async ({ page }) => {
    await openNote(page, 'Plain')
    await selectInEditor(page, 'beta')
    await page.keyboard.press(key)
    const formatted = PLAIN.replace('beta', `${marker}beta${marker}`)
    await expect.poll(() => editorDoc(page)).toBe(formatted)
    expect(await editorVisibleText(page)).toBe(PLAIN)
    // Selection still covers the word: pressing again toggles it off.
    await page.keyboard.press(key)
    await expect.poll(() => editorDoc(page)).toBe(PLAIN)
    await page.keyboard.press(key)
    await expect.poll(() => editorDoc(page)).toBe(formatted)

    await undo(page)
    await expect.poll(() => editorDoc(page)).toBe(PLAIN)
    await undo(page)
    await expect.poll(() => editorDoc(page)).toBe(formatted)
    await undo(page)
    await expectPristine(page, PLAIN)
    // Nothing left to undo: stays pristine (no native-undo fallthrough).
    await undo(page)
    await expectPristine(page, PLAIN)
    await page.keyboard.press('Control+y')
    await expect.poll(() => editorDoc(page)).toBe(formatted)
    expect(await editorVisibleText(page)).not.toMatch(RAW_MARKER_RE)
  })
}

test('alignment shortcuts Ctrl+Shift+E / R / L set and clear the line marker', async ({ page }) => {
  await openNote(page, 'Plain')
  // With a non-empty selection (where Ctrl+Shift+L used to select matches).
  await selectInEditor(page, 'second line')
  await page.keyboard.press('Control+Shift+e')
  await expect.poll(() => editorDoc(page)).toBe(PLAIN.replace('second', '{align:center}second'))
  await page.keyboard.press('Control+Shift+r')
  await expect.poll(() => editorDoc(page)).toBe(PLAIN.replace('second', '{align:right}second'))
  await expect(page.locator('.cm-line', { hasText: 'second line here' })).toHaveCSS(
    'text-align',
    'right',
  )
  await page.keyboard.press('Control+Shift+l')
  await expect.poll(() => editorDoc(page)).toBe(PLAIN)
  await undo(page)
  await expect.poll(() => editorDoc(page)).toBe(PLAIN.replace('second', '{align:right}second'))
  await undo(page)
  await undo(page)
  await expectPristine(page, PLAIN)
})

const TOOLBAR_CASES: {
  name: string
  apply: (page: Page) => Promise<void>
  expected: string
}[] = [
  { name: 'Bold', apply: (p) => clickTool(p, 'Bold'), expected: '**beta**' },
  { name: 'Italic', apply: (p) => clickTool(p, 'Italic'), expected: '_beta_' },
  { name: 'Underline', apply: (p) => clickTool(p, 'Underline'), expected: '++beta++' },
  { name: 'Strikethrough', apply: (p) => clickTool(p, 'Strikethrough'), expected: '~~beta~~' },
  { name: 'Inline code', apply: (p) => clickTool(p, 'Inline code'), expected: '`beta`' },
  {
    name: 'Text color',
    apply: async (p) => {
      await clickTool(p, 'Text color')
      await clickTool(p, 'Text: red')
    },
    expected: '{color:red}beta{/color}',
  },
  {
    name: 'Background color',
    apply: async (p) => {
      await clickTool(p, 'Background color')
      await clickTool(p, 'Background: yellow')
    },
    expected: '==beta=={.yellow}',
  },
  {
    name: 'Font size',
    apply: async (p) => {
      await clickTool(p, 'Font size')
      await clickTool(p, '24px')
    },
    expected: '{size:24}beta{/size}',
  },
]

async function clickTool(page: Page, title: string) {
  await formatToolbar(page).getByTitle(title, { exact: false }).first().click()
}

for (const c of TOOLBAR_CASES) {
  test(`toolbar ${c.name}: applies, renders without markers, undo restores exactly`, async ({
    page,
  }) => {
    await openNote(page, 'Plain')
    await selectInEditor(page, 'beta')
    await expect(formatToolbar(page)).toBeVisible()
    await c.apply(page)
    const formatted = PLAIN.replace('beta', c.expected)
    await expect.poll(() => editorDoc(page)).toBe(formatted)
    expect(await editorVisibleText(page)).toBe(PLAIN)
    await editor(page).focus()
    await undo(page)
    await expectPristine(page, PLAIN)
    await page.keyboard.press('Control+y')
    await expect.poll(() => editorDoc(page)).toBe(formatted)
    expect(await editorVisibleText(page)).toBe(PLAIN)
  })
}

test('stacked formats, partial overlap, multi-line, clear-all — each undone step by step', async ({
  page,
}) => {
  await openNote(page, 'Plain')
  const steps: string[] = [PLAIN]
  const snap = async () => {
    const d = await editorDoc(page)
    expect(await editorVisibleText(page)).not.toMatch(RAW_MARKER_RE)
    steps.push(d)
  }

  await selectInEditor(page, 'alpha beta')
  await page.keyboard.press('Control+b')
  await snap()
  await selectInEditor(page, 'beta')
  await page.keyboard.press('Control+i')
  await snap()
  // Partial overlap with the bold span.
  await selectInEditor(page, 'ta_** gam')
  await clickTool(page, 'Text color')
  await clickTool(page, 'Text: blue')
  await snap()
  await selectInEditor(page, '{/color}ma')
  await clickTool(page, 'Background color')
  await clickTool(page, 'Background: green')
  await snap()
  // Multi-line selection.
  await selectInEditor(page, 'second line here\nthird')
  await clickTool(page, 'Underline')
  await snap()
  await selectInEditor(page, 'second line here++\n++third')
  await clickTool(page, 'Font size')
  await clickTool(page, '18px')
  await snap()
  // Clear-all over everything.
  await page.keyboard.press('Control+a')
  await page.locator('.cm-content').dispatchEvent('keyup')
  await clickTool(page, 'Remove all formatting')
  await snap()
  // Clear-all strips every marker: back to the plain text (as one undo step).
  expect(steps[steps.length - 1]).toBe(PLAIN)
  expect(new Set(steps.slice(0, -1)).size).toBe(steps.length - 1)

  await editor(page).focus()
  for (let i = steps.length - 2; i >= 0; i--) {
    await undo(page)
    await expect.poll(() => editorDoc(page)).toBe(steps[i])
    expect(await editorVisibleText(page)).not.toMatch(RAW_MARKER_RE)
  }
  await expectPristine(page, PLAIN)
  for (let i = 1; i < steps.length; i++) {
    await page.keyboard.press('Control+y')
    await expect.poll(() => editorDoc(page)).toBe(steps[i])
  }
})

test('undo after switching tabs back and forth restores the pre-format text', async ({ page }) => {
  await openNote(page, 'Plain')
  await selectInEditor(page, 'gamma')
  await page.keyboard.press('Control+b')
  await clickTool(page, 'Text color').catch(() => undefined)
  await expect.poll(() => editorDoc(page)).toContain('**gamma**')
  // Type in another tab so Chromium's native undo stack has foreign edits.
  await openNote(page, 'Other')
  await page.keyboard.press('Control+End')
  await page.keyboard.type('typed in other')
  await openNote(page, 'Plain')
  await openNote(page, 'Other')
  await openNote(page, 'Plain')
  await editor(page).focus()
  await undo(page)
  await expectPristine(page, PLAIN)
  await undo(page)
  await undo(page)
  await expectPristine(page, PLAIN)
  // The other tab kept its own history.
  await openNote(page, 'Other')
  await expect.poll(() => editorDoc(page)).toBe('other note\ntyped in other')
})

test('fresh tab with no history: Ctrl+Z / Ctrl+Y change nothing', async ({ page }) => {
  await openNote(page, 'Rendered')
  const before = await editorDoc(page)
  await caretInEditor(page, 'bold')
  for (let i = 0; i < 3; i++) await undo(page)
  for (let i = 0; i < 3; i++) await page.keyboard.press('Control+y')
  expect(await editorDoc(page)).toBe(before)
  await expect(page.locator('.cm-content .cm-line').nth(0)).toHaveText(
    'b bold i ital u under s strike c code',
  )
})

test('Ctrl+S saves with auto-save off; undo after save still exact', async ({ page, vault }) => {
  await openNote(page, 'Plain')
  await selectInEditor(page, 'alpha')
  await page.keyboard.press('Control+b')
  await page.keyboard.press('Control+s')
  await expect.poll(() => vault.read('Plain.md')).toBe(PLAIN.replace('alpha', '**alpha**'))
  await undo(page)
  await expectPristine(page, PLAIN)
  await page.keyboard.press('Control+s')
  await expect.poll(() => vault.read('Plain.md')).toBe(PLAIN)
})

test.describe('with auto-save on', () => {
  test.use({ settings: { autoSave: true } })
  test('undo after an auto-save restores the pre-format text, and auto-saves it', async ({
    page,
    vault,
  }) => {
    await openNote(page, 'Plain')
    await selectInEditor(page, 'third line')
    await clickTool(page, 'Strikethrough')
    await expect
      .poll(() => vault.read('Plain.md'), { timeout: 15_000 })
      .toBe(PLAIN.replace('third line', '~~third line~~'))
    await editor(page).focus()
    await undo(page)
    await expectPristine(page, PLAIN)
    await expect.poll(() => vault.read('Plain.md'), { timeout: 15_000 }).toBe(PLAIN)
  })
})

test('caret moves over hidden markers; typing and Backspace next to styled text', async ({
  page,
}) => {
  await openNote(page, 'Plain')
  await selectInEditor(page, 'beta')
  await page.keyboard.press('Control+b')
  // doc: "alpha **beta** gamma"
  await caretInEditor(page, 'alpha'.length + 1) // before the opening **
  // The hidden "**" is atomic: the caret never lands between the two "*".
  // (The first press steps over the hidden marker — outside → inside the bold
  // span — so it takes two presses to pass "b".)
  await page.keyboard.press('ArrowRight')
  expect((await editorSelection(page)).from).toBe('alpha **'.length)
  await page.keyboard.press('ArrowRight')
  const afterB = await editorSelection(page)
  expect(await editorDoc(page).then((d) => d.slice(0, afterB.from))).toBe('alpha **b')
  await page.keyboard.press('End')
  expect((await editorSelection(page)).from).toBe('alpha **beta** gamma'.length)
  await page.keyboard.press('Home')
  expect((await editorSelection(page)).from).toBe(0)

  // Type at the end of the bold word: lands inside the styling, markers intact.
  await caretInEditor(page, 'alpha **beta'.length)
  await page.keyboard.type('X')
  await expect.poll(() => editorDoc(page)).toContain('**betaX**')
  // Backspace twice removes visible chars, never a marker char.
  await page.keyboard.press('Backspace')
  await page.keyboard.press('Backspace')
  await expect.poll(() => editorDoc(page)).toContain('**bet**')
  expect(await editorVisibleText(page)).not.toMatch(RAW_MARKER_RE)
  // Backspace from just after the closing ** deletes "t", not a "*".
  await caretInEditor(page, 'alpha **bet**'.length)
  await page.keyboard.press('Backspace')
  await expect.poll(() => editorDoc(page)).toContain('**be**')
  expect(await editorVisibleText(page)).not.toMatch(RAW_MARKER_RE)
  // Deleting the whole styled word (select visible text, Backspace) leaves no orphan markers.
  await selectInEditor(page, 'be')
  await page.keyboard.press('Backspace')
  await expect.poll(() => editorDoc(page)).toBe(PLAIN.replace('beta ', ' '))
  expect(await editorVisibleText(page)).not.toMatch(RAW_MARKER_RE)
  // One undo brings the word back, styled, markers hidden.
  await page.keyboard.press('Control+z')
  await expect.poll(() => editorDoc(page)).toContain('alpha **be** gamma')
  expect(await editorVisibleText(page)).not.toMatch(RAW_MARKER_RE)
  await expect(noteButton(page, 'Plain')).toBeVisible()
})

test('italic on part of a word never leaves raw underscores', async ({ page }) => {
  await openNote(page, 'Plain')
  // "bet" inside "beta": an intraword _..._ would not render as italic.
  await selectInEditor(page, 'bet')
  await page.keyboard.press('Control+i')
  await expect.poll(() => editorDoc(page)).toBe(PLAIN.replace('beta', '_beta_'))
  expect(await editorVisibleText(page)).toBe(PLAIN)
  await expect(page.locator('.cm-line span[style*="italic"]').first()).toHaveText('beta')
  // Toggling again on part of the italic word removes it.
  await selectInEditor(page, 'et')
  await page.keyboard.press('Control+i')
  await expect.poll(() => editorDoc(page)).toBe(PLAIN)
})
