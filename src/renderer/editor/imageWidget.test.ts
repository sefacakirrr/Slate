import { describe, expect, it, vi } from 'vitest'

// The real module imports @renderer/api (window.api) at module level; stub it
// so the exported pure functions can be imported and tested directly.
vi.mock('@renderer/api', () => ({ api: {} }))
const { findAttachmentLinks, serializeImage } = await import('./imageWidget')

// Test the pure logic of image link finding (extracted for testability)
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif'])

function isImagePath(path: string): boolean {
  const dot = path.lastIndexOf('.')
  if (dot === -1) return false
  return IMAGE_EXTENSIONS.has(path.slice(dot + 1).toLowerCase())
}

const IMAGE_RE = /!\[([^\]]*)\]\(([^)]+)\)/g

function findImageLinks(doc: string): { from: number; to: number; alt: string; path: string }[] {
  const results: { from: number; to: number; alt: string; path: string }[] = []

  const fenceRanges: { start: number; end: number }[] = []
  const fenceRe = /^```[^\n]*\n[\s\S]*?^```/gm
  for (const m of doc.matchAll(fenceRe)) {
    const idx = m.index ?? 0
    fenceRanges.push({ start: idx, end: idx + m[0].length })
  }

  const inlineCodeRanges: { start: number; end: number }[] = []
  const inlineRe = /`[^`]+`/g
  for (const m of doc.matchAll(inlineRe)) {
    const idx = m.index ?? 0
    inlineCodeRanges.push({ start: idx, end: idx + m[0].length })
  }

  const excluded = [...fenceRanges, ...inlineCodeRanges]

  for (const m of doc.matchAll(IMAGE_RE)) {
    const pos = m.index ?? 0
    const inExcluded = excluded.some((r) => pos >= r.start && pos < r.end)
    if (inExcluded) continue
    if (!isImagePath(m[2])) continue

    results.push({
      from: pos,
      to: pos + m[0].length,
      alt: m[1],
      path: m[2],
    })
  }

  return results
}

describe('isImagePath', () => {
  it('recognizes common image extensions', () => {
    expect(isImagePath('photo.png')).toBe(true)
    expect(isImagePath('photo.jpg')).toBe(true)
    expect(isImagePath('photo.jpeg')).toBe(true)
    expect(isImagePath('photo.gif')).toBe(true)
    expect(isImagePath('photo.webp')).toBe(true)
    expect(isImagePath('photo.svg')).toBe(true)
    expect(isImagePath('photo.bmp')).toBe(true)
    expect(isImagePath('photo.avif')).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(isImagePath('photo.PNG')).toBe(true)
    expect(isImagePath('photo.Jpg')).toBe(true)
  })

  it('rejects non-image extensions', () => {
    expect(isImagePath('doc.pdf')).toBe(false)
    expect(isImagePath('file.txt')).toBe(false)
    expect(isImagePath('archive.zip')).toBe(false)
  })

  it('rejects paths without extension', () => {
    expect(isImagePath('Makefile')).toBe(false)
  })
})

describe('findImageLinks', () => {
  it('finds a simple image link', () => {
    const doc = '![alt text](_attachments/abc123.png)'
    const results = findImageLinks(doc)
    expect(results).toHaveLength(1)
    expect(results[0].alt).toBe('alt text')
    expect(results[0].path).toBe('_attachments/abc123.png')
    expect(results[0].from).toBe(0)
    expect(results[0].to).toBe(doc.length)
  })

  it('finds multiple image links', () => {
    const doc = '![a](img1.png)\nsome text\n![b](img2.jpg)'
    const results = findImageLinks(doc)
    expect(results).toHaveLength(2)
    expect(results[0].path).toBe('img1.png')
    expect(results[1].path).toBe('img2.jpg')
  })

  it('ignores non-image links', () => {
    const doc = '![readme](file.pdf)'
    const results = findImageLinks(doc)
    expect(results).toHaveLength(0)
  })

  it('ignores images inside fenced code blocks', () => {
    const doc = '```\n![inside](code.png)\n```'
    const results = findImageLinks(doc)
    expect(results).toHaveLength(0)
  })

  it('ignores images inside inline code', () => {
    const doc = 'use `![example](inline.png)` syntax'
    const results = findImageLinks(doc)
    expect(results).toHaveLength(0)
  })

  it('finds images outside code blocks while ignoring those inside', () => {
    const doc = '![outside](real.png)\n```\n![inside](fake.png)\n```\n![also outside](real2.jpg)'
    const results = findImageLinks(doc)
    expect(results).toHaveLength(2)
    expect(results[0].path).toBe('real.png')
    expect(results[1].path).toBe('real2.jpg')
  })

  it('handles empty alt text', () => {
    const doc = '![](image.png)'
    const results = findImageLinks(doc)
    expect(results).toHaveLength(1)
    expect(results[0].alt).toBe('')
  })

  it('handles paths with subdirectories', () => {
    const doc = '![photo](_attachments/2024/photo.webp)'
    const results = findImageLinks(doc)
    expect(results).toHaveLength(1)
    expect(results[0].path).toBe('_attachments/2024/photo.webp')
  })
})

describe('serializeImage (Epic 14)', () => {
  it('emits plain markdown at natural size', () => {
    expect(serializeImage('_attachments/pic.png', 'pic', null)).toBe('![pic](_attachments/pic.png)')
  })

  it('emits an HTML <img> tag once a width is set', () => {
    expect(serializeImage('_attachments/pic.png', 'pic', 300)).toBe(
      '<img src="_attachments/pic.png" alt="pic" width="300" />',
    )
  })

  it('rounds fractional widths', () => {
    expect(serializeImage('a.png', '', 299.6)).toContain('width="300"')
  })

  it('escapes quotes and ampersands in attributes', () => {
    expect(serializeImage('a&b.png', 'say "hi"', 200)).toBe(
      '<img src="a&amp;b.png" alt="say &quot;hi&quot;" width="200" />',
    )
  })
})

describe('findAttachmentLinks: HTML <img> parsing (Epic 14)', () => {
  it('parses an <img> tag with width', () => {
    const doc = '<img src="_attachments/pic.png" alt="pic" width="300" />'
    const links = findAttachmentLinks(doc)
    expect(links).toHaveLength(1)
    expect(links[0]).toMatchObject({
      path: '_attachments/pic.png',
      name: 'pic',
      isImage: true,
      width: 300,
      from: 0,
      to: doc.length,
    })
  })

  it('parses an <img> tag without width as natural size', () => {
    const links = findAttachmentLinks('<img src="pic.png" alt="" />')
    expect(links).toHaveLength(1)
    expect(links[0].width).toBeNull()
  })

  it('ignores an invalid width value', () => {
    expect(findAttachmentLinks('<img src="p.png" width="abc" />')[0].width).toBeNull()
    expect(findAttachmentLinks('<img src="p.png" width="-50" />')[0].width).toBeNull()
  })

  it('round-trips serializeImage output', () => {
    const doc = serializeImage('_attachments/a&b.png', 'say "hi"', 240)
    const links = findAttachmentLinks(doc)
    expect(links[0]).toMatchObject({
      path: '_attachments/a&b.png',
      name: 'say "hi"',
      width: 240,
    })
  })

  it('markdown images still parse with width null', () => {
    const links = findAttachmentLinks('![shot](_attachments/shot.png)')
    expect(links[0]).toMatchObject({ isImage: true, width: null })
  })

  it('skips <img> tags without a src or with a non-image src', () => {
    expect(findAttachmentLinks('<img width="300" />')).toHaveLength(0)
    expect(findAttachmentLinks('<img src="doc.pdf" width="300" />')).toHaveLength(0)
  })

  it('skips <img> tags inside code fences and inline code', () => {
    expect(findAttachmentLinks('```html\n<img src="pic.png" width="300" />\n```')).toHaveLength(0)
    expect(findAttachmentLinks('use `<img src="pic.png" width="300" />` here')).toHaveLength(0)
  })

  it('finds both markdown and HTML images in one doc, sorted by position', () => {
    const doc = '![a](one.png)\n\n<img src="two.png" alt="b" width="150" />'
    const links = findAttachmentLinks(doc)
    expect(links.map((l) => l.path)).toEqual(['one.png', 'two.png'])
    expect(links.map((l) => l.width)).toEqual([null, 150])
  })
})
