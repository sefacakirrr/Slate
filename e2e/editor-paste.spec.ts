import { expect, type Page, test } from './fixtures'
import { caretInEditor, editorDoc, noticeToast, openNote, setClipboardText } from './support/ui'

test.use({
  settings: { autoSave: false },
  vaultFiles: {
    'Paste.md': 'intro\n',
    'Fenced.md': 'before\n```js\nconst x = 1\n```\nafter\n',
    'Plain.txt': 'text file\n',
  },
})

const JS = `function readConfig(path) {
  const raw = fs.readFileSync(path, 'utf8')
  console.log('loaded', path)
  return JSON.parse(raw)
}`
const CSS = `.card {
  display: flex;
  padding: 12px 16px;
  border-radius: 8px;
}`
const HTML = `<ul class="nav">
  <li><a href="/">Home</a></li>
  <li><a href="/about">About</a></li>
</ul>`
const JSON_TEXT = `{
  "name": "slate",
  "private": true
}`
const PYTHON = `class Stack:
    def __init__(self):
        self.items = []

    def push(self, item):
        self.items.append(item)`

async function pasteText(page: Page, app: import('./fixtures').ElectronApplication, text: string) {
  await setClipboardText(app, text)
  await page.keyboard.press('Control+v')
}

async function endOfDoc(page: Page) {
  await page.keyboard.press('Control+End')
}

for (const [lang, code] of [
  ['javascript', JS],
  ['css', CSS],
  ['html', HTML],
  ['json', JSON_TEXT],
  ['python', PYTHON],
] as const) {
  test(`pasting ${lang} wraps it in a \`\`\`${lang} fence; one undo restores`, async ({
    page,
    slate,
  }) => {
    await openNote(page, 'Paste')
    await endOfDoc(page)
    await pasteText(page, slate.app, code)
    await expect.poll(() => editorDoc(page)).toBe(`intro\n\`\`\`${lang}\n${code}\n\`\`\`\n`)
    // Rendered as a code block: no marker hiding inside it.
    await page.keyboard.press('Control+z')
    await expect.poll(() => editorDoc(page)).toBe('intro\n')
  })
}

for (const [name, text] of [
  ['English prose', 'I went to the market today and bought apples.\nThen I walked home.'],
  [
    'Turkish prose',
    'Bugün markete gittim ve elma aldım.\nSonra eve yürüdüm; hava çok güzeldi, değil mi?',
  ],
  ['a markdown list', '- milk\n- eggs: 12\n- bread (whole wheat)\n- [ ] call mom'],
] as const) {
  test(`pasting ${name} pastes it as-is`, async ({ page, slate }) => {
    await openNote(page, 'Paste')
    await endOfDoc(page)
    await pasteText(page, slate.app, text)
    await expect.poll(() => editorDoc(page)).toBe(`intro\n${text}`)
  })
}

test('pasting code inside an existing fence does not nest a fence', async ({ page, slate }) => {
  await openNote(page, 'Fenced')
  await caretInEditor(page, 'const x = 1')
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await pasteText(page, slate.app, JS)
  const doc = await editorDoc(page)
  expect(doc.match(/```/g)).toHaveLength(2)
  expect(doc).toContain(`const x = 1\n${JS}`)
})

test('Ctrl+Shift+V pastes code as plain text', async ({ page, slate }) => {
  await openNote(page, 'Paste')
  await endOfDoc(page)
  await setClipboardText(slate.app, JS)
  await page.keyboard.press('Control+Shift+v')
  await expect.poll(() => editorDoc(page)).toBe(`intro\n${JS}`)
  // A normal paste right after still detects code.
  await page.keyboard.press('Enter')
  await page.keyboard.press('Control+v')
  await expect.poll(() => editorDoc(page)).toContain('```javascript\n')
})

test('.txt notes never wrap pasted code', async ({ page, slate }) => {
  await openNote(page, 'Plain')
  await endOfDoc(page)
  await pasteText(page, slate.app, JS)
  await expect.poll(() => editorDoc(page)).toBe(`text file\n${JS}`)
})

test('pasting an image stores it in _attachments and renders it', async ({
  page,
  slate,
  vault,
}) => {
  await openNote(page, 'Paste')
  await endOfDoc(page)
  await slate.app.evaluate(({ clipboard, nativeImage }) => {
    const w = 40
    const h = 30
    const buf = Buffer.alloc(w * h * 4)
    for (let i = 0; i < buf.length; i += 4) {
      buf[i] = 200 // B
      buf[i + 1] = 60 // G
      buf[i + 2] = 20 // R
      buf[i + 3] = 255
    }
    clipboard.writeImage(nativeImage.createFromBitmap(buf, { width: w, height: h }))
  })
  await page.keyboard.press('Control+v')
  await expect
    .poll(() => editorDoc(page))
    .toMatch(/^intro\n!\[[^\]]+\]\(_attachments\/[0-9a-f]+\.png\)$/)
  const files = await vault.listFiles('_attachments')
  expect(files).toHaveLength(1)
  const img = page.locator('.cm-image-widget img')
  await expect(img).toBeVisible()
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(40)
})

test('a file over 10 MB is rejected with a visible message', async ({ page, vault }) => {
  await openNote(page, 'Paste')
  await endOfDoc(page)
  // A synthetic paste carrying a real 11 MB File (the OS clipboard can't be
  // filled with a file from here).
  await page.evaluate(() => {
    const dt = new DataTransfer()
    dt.items.add(
      new File([new Uint8Array(11 * 1024 * 1024)], 'huge.pdf', { type: 'application/pdf' }),
    )
    const content = document.querySelector('.cm-content') as HTMLElement
    content.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }),
    )
  })
  await expect(noticeToast(page)).toContainText('huge.pdf')
  await expect(noticeToast(page)).toContainText('10 MB')
  expect(await editorDoc(page)).toBe('intro\n')
  expect(await vault.listFiles('_attachments')).toHaveLength(0)
})

test('dropping a non-note file attaches it as a file chip', async ({ page, vault }) => {
  await openNote(page, 'Paste')
  await endOfDoc(page)
  await page.evaluate(() => {
    const dt = new DataTransfer()
    dt.items.add(new File(['%PDF-1.4 tiny'], 'report.pdf', { type: 'application/pdf' }))
    const content = document.querySelector('.cm-content') as HTMLElement
    content.dispatchEvent(
      new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }),
    )
  })
  await expect
    .poll(() => editorDoc(page))
    .toMatch(/^intro\n\[report\.pdf\]\(_attachments\/[0-9a-f]+\.pdf\)$/)
  expect(await vault.listFiles('_attachments')).toHaveLength(1)
  await expect(page.locator('.cm-file-widget')).toContainText('report.pdf')
})
