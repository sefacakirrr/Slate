import AdmZip from 'adm-zip'
import { describe, expect, it } from 'vitest'
import { htmlToNote } from './html'
import { mdToNote } from './md'
import { notionZipToNotes } from './notion'
import { txtToNote } from './txt'

describe('txtToNote', () => {
  it('renames .txt to .md and keeps content verbatim', () => {
    const note = txtToNote('shopping list.txt', 'milk\neggs\n')
    expect(note.name).toBe('shopping list.md')
    expect(note.content).toBe('milk\neggs\n')
  })

  it('is case-insensitive on the extension', () => {
    expect(txtToNote('NOTES.TXT', 'x').name).toBe('NOTES.md')
  })

  it('only strips a trailing .txt, not one mid-name', () => {
    expect(txtToNote('my.txt.backup.txt', 'x').name).toBe('my.txt.backup.md')
  })
})

describe('mdToNote', () => {
  it('passes name and content through unchanged', () => {
    const note = mdToNote('ideas.md', '# Ideas\n')
    expect(note).toEqual({ name: 'ideas.md', content: '# Ideas\n' })
  })
})

describe('htmlToNote', () => {
  it('converts headings, emphasis and lists to markdown', () => {
    const html = '<h1>Title</h1><p>Hello <b>bold</b> and <i>italic</i></p><ul><li>a</li><li>b</li></ul>'
    const note = htmlToNote('note.html', html)
    expect(note.name).toBe('note.md')
    expect(note.content).toContain('# Title')
    expect(note.content).toContain('**bold**')
    expect(note.content).toContain('_italic_')
    expect(note.content).toContain('a')
    expect(note.content).toContain('b')
  })

  it('strips scripts and styles', () => {
    const html = '<style>.x{color:red}</style><script>alert(1)</script><p>keep</p>'
    const note = htmlToNote('n.htm', html)
    expect(note.content).toContain('keep')
    expect(note.content).not.toContain('alert')
    expect(note.content).not.toContain('color:red')
  })

  it('preserves links and images', () => {
    const note = htmlToNote('n.html', '<p><a href="https://x.dev">site</a> <img src="pic.png" alt="p"></p>')
    expect(note.content).toContain('[site](https://x.dev)')
    expect(note.content).toContain('![p](pic.png)')
  })

  it('handles .htm extension', () => {
    expect(htmlToNote('page.htm', '<p>x</p>').name).toBe('page.md')
  })
})

describe('notionZipToNotes', () => {
  const NOTION_ID = '0123456789abcdef0123456789abcdef'

  function makeZip(files: Record<string, Buffer | string>): Buffer {
    const zip = new AdmZip()
    for (const [name, data] of Object.entries(files)) {
      zip.addFile(name, typeof data === 'string' ? Buffer.from(data, 'utf-8') : data)
    }
    return zip.toBuffer()
  }

  it('extracts md notes and strips Notion ids from names', () => {
    const buf = makeZip({ [`My Page ${NOTION_ID}.md`]: '# My Page\n\nBody' })
    const { notes, attachments } = notionZipToNotes(buf)
    expect(notes).toHaveLength(1)
    expect(notes[0].name).toBe('My Page.md')
    expect(notes[0].content).toContain('Body')
    expect(attachments).toHaveLength(0)
  })

  it('flattens nested pages', () => {
    const buf = makeZip({
      [`Parent ${NOTION_ID}.md`]: 'parent',
      [`Parent ${NOTION_ID}/Child ${NOTION_ID}.md`]: 'child',
    })
    const { notes } = notionZipToNotes(buf)
    expect(notes.map((n) => n.name).sort()).toEqual(['Child.md', 'Parent.md'])
  })

  it('suffixes colliding flattened names', () => {
    const buf = makeZip({
      [`A ${NOTION_ID}/Note ${NOTION_ID}.md`]: 'one',
      [`B ${NOTION_ID}/Note ${NOTION_ID}.md`]: 'two',
    })
    const { notes } = notionZipToNotes(buf)
    const names = notes.map((n) => n.name).sort()
    expect(names).toEqual(['Note-1.md', 'Note.md'])
  })

  it('extracts image assets hash-named into _attachments and rewrites links', () => {
    const img = Buffer.from('fake-png-bytes')
    const dir = `Page ${NOTION_ID}`
    const buf = makeZip({
      [`${dir}.md`]: `![shot](${encodeURIComponent(dir)}/shot.png)`,
      [`${dir}/shot.png`]: img,
    })
    const { notes, attachments } = notionZipToNotes(buf)
    expect(attachments).toHaveLength(1)
    expect(attachments[0].path).toMatch(/^_attachments\/[0-9a-f]{64}\.png$/)
    expect(attachments[0].data.equals(img)).toBe(true)
    expect(notes[0].content).toContain(`![shot](${attachments[0].path})`)
  })

  it('leaves external URLs untouched', () => {
    const buf = makeZip({ [`P ${NOTION_ID}.md`]: '[x](https://example.com/a.png)' })
    const { notes } = notionZipToNotes(buf)
    expect(notes[0].content).toBe('[x](https://example.com/a.png)')
  })

  it('skips CSV database exports', () => {
    const buf = makeZip({
      [`Db ${NOTION_ID}.csv`]: 'a,b\n1,2',
      [`Note ${NOTION_ID}.md`]: 'text',
    })
    const { notes, attachments } = notionZipToNotes(buf)
    expect(notes).toHaveLength(1)
    expect(attachments).toHaveLength(0)
  })

  it('dedupes identical assets referenced from multiple notes', () => {
    const img = Buffer.from('same-bytes')
    const a = `A ${NOTION_ID}`
    const b = `B ${NOTION_ID}`
    const buf = makeZip({
      [`${a}.md`]: `![i](${encodeURIComponent(a)}/pic.png)`,
      [`${a}/pic.png`]: img,
      [`${b}.md`]: `![i](${encodeURIComponent(b)}/pic.png)`,
      [`${b}/pic.png`]: img,
    })
    const { attachments } = notionZipToNotes(buf)
    expect(attachments).toHaveLength(1)
  })
})
