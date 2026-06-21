import { RangeSetBuilder } from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  type EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view'
import { api } from '@renderer/api'

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif'])

function isImagePath(path: string): boolean {
  const dot = path.lastIndexOf('.')
  if (dot === -1) return false
  return IMAGE_EXTENSIONS.has(path.slice(dot + 1).toLowerCase())
}

// Matches ![alt](path) for images
const IMAGE_RE = /!\[([^\]]*)\]\(([^)]+)\)/g
// Matches [name](path) for file links (non-image)
const FILE_LINK_RE = /\[([^\]]+)\]\((_attachments\/[^)]+)\)/g

type LinkMatch = {
  from: number
  to: number
  name: string
  path: string
  isImage: boolean
}

function findAttachmentLinks(doc: string): LinkMatch[] {
  const results: LinkMatch[] = []

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
  const isExcluded = (pos: number) => excluded.some((r) => pos >= r.start && pos < r.end)

  // Find image links
  for (const m of doc.matchAll(IMAGE_RE)) {
    const pos = m.index ?? 0
    if (isExcluded(pos)) continue
    if (!isImagePath(m[2])) continue

    results.push({
      from: pos,
      to: pos + m[0].length,
      name: m[1],
      path: m[2],
      isImage: true,
    })
  }

  // Find file links (only _attachments/ paths, not general markdown links)
  for (const m of doc.matchAll(FILE_LINK_RE)) {
    const pos = m.index ?? 0
    if (isExcluded(pos)) continue
    // Skip if it's actually an image link (starts with !)
    if (pos > 0 && doc[pos - 1] === '!') continue
    if (isImagePath(m[2])) continue

    results.push({
      from: pos,
      to: pos + m[0].length,
      name: m[1],
      path: m[2],
      isImage: false,
    })
  }

  results.sort((a, b) => a.from - b.from)
  return results
}

function resolveImageSrc(relativePath: string): string {
  return `slate-attachment:///${encodeURIComponent(relativePath)}`
}

function getFileExtension(path: string): string {
  const dot = path.lastIndexOf('.')
  if (dot === -1) return ''
  return path.slice(dot + 1).toLowerCase()
}

class ImageWidget extends WidgetType {
  private readonly src: string
  private readonly alt: string
  private readonly from: number
  private readonly to: number

  constructor(src: string, alt: string, from: number, to: number) {
    super()
    this.src = src
    this.alt = alt
    this.from = from
    this.to = to
  }

  eq(other: ImageWidget): boolean {
    return this.src === other.src && this.from === other.from
  }

  toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement('span')
    wrapper.className = 'cm-image-widget'
    wrapper.style.display = 'block'
    wrapper.style.position = 'relative'
    wrapper.style.padding = '4px 0'
    wrapper.style.maxWidth = '100%'
    wrapper.contentEditable = 'false'

    const img = document.createElement('img')
    img.src = this.src
    img.alt = this.alt
    img.style.maxWidth = '100%'
    img.style.height = 'auto'
    img.style.borderRadius = '6px'
    img.style.display = 'block'
    img.loading = 'lazy'

    img.onerror = () => {
      img.style.display = 'none'
      const placeholder = document.createElement('span')
      placeholder.style.display = 'block'
      placeholder.style.padding = '8px 12px'
      placeholder.style.borderRadius = '6px'
      placeholder.style.backgroundColor = '#1e293b'
      placeholder.style.color = '#94a3b8'
      placeholder.style.fontSize = '12px'
      placeholder.style.border = '1px dashed #475569'
      placeholder.textContent = `Image not found: ${this.alt || 'attachment'}`
      wrapper.appendChild(placeholder)
    }

    wrapper.appendChild(img)
    wrapper.appendChild(createDeleteButton(view, this.from, this.to))

    wrapper.addEventListener('mouseenter', () => {
      const btn = wrapper.querySelector('.cm-widget-delete') as HTMLElement
      if (btn) btn.style.opacity = '1'
    })
    wrapper.addEventListener('mouseleave', () => {
      const btn = wrapper.querySelector('.cm-widget-delete') as HTMLElement
      if (btn) btn.style.opacity = '0'
    })

    return wrapper
  }

  ignoreEvent(event: Event): boolean {
    return event.type !== 'mousedown'
  }
}

class FileWidget extends WidgetType {
  private readonly name: string
  private readonly ext: string
  private readonly path: string
  private readonly from: number
  private readonly to: number

  constructor(name: string, ext: string, path: string, from: number, to: number) {
    super()
    this.name = name
    this.ext = ext
    this.path = path
    this.from = from
    this.to = to
  }

  eq(other: FileWidget): boolean {
    return this.name === other.name && this.from === other.from
  }

  toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement('span')
    wrapper.className = 'cm-file-widget'
    wrapper.style.display = 'inline-flex'
    wrapper.style.alignItems = 'center'
    wrapper.style.gap = '6px'
    wrapper.style.padding = '6px 12px'
    wrapper.style.borderRadius = '6px'
    wrapper.style.backgroundColor = '#1e293b'
    wrapper.style.border = '1px solid #334155'
    wrapper.style.fontSize = '12px'
    wrapper.style.color = '#cbd5e1'
    wrapper.style.margin = '2px 0'
    wrapper.style.maxWidth = '100%'
    wrapper.style.position = 'relative'
    wrapper.style.cursor = 'pointer'
    wrapper.contentEditable = 'false'

    // File icon
    const icon = document.createElement('span')
    icon.textContent = '📄'
    icon.style.fontSize = '14px'
    icon.style.flexShrink = '0'

    // Filename
    const nameEl = document.createElement('span')
    nameEl.textContent = this.name
    nameEl.style.overflow = 'hidden'
    nameEl.style.textOverflow = 'ellipsis'
    nameEl.style.whiteSpace = 'nowrap'

    // Extension badge
    const badge = document.createElement('span')
    if (this.ext) {
      badge.textContent = this.ext.toUpperCase()
      badge.style.fontSize = '9px'
      badge.style.padding = '1px 4px'
      badge.style.borderRadius = '3px'
      badge.style.backgroundColor = '#334155'
      badge.style.color = '#94a3b8'
      badge.style.fontWeight = '600'
      badge.style.flexShrink = '0'
    }

    // Open hint
    const openHint = document.createElement('span')
    openHint.textContent = 'Open'
    openHint.style.fontSize = '10px'
    openHint.style.color = '#64748b'
    openHint.style.marginLeft = 'auto'
    openHint.style.flexShrink = '0'
    openHint.style.opacity = '0'
    openHint.style.transition = 'opacity 150ms'

    wrapper.appendChild(icon)
    wrapper.appendChild(nameEl)
    if (this.ext) wrapper.appendChild(badge)
    wrapper.appendChild(openHint)

    // Delete button
    const deleteBtn = createDeleteButton(view, this.from, this.to)
    deleteBtn.style.position = 'relative'
    deleteBtn.style.top = '0'
    deleteBtn.style.right = '0'
    deleteBtn.style.marginLeft = '6px'
    wrapper.appendChild(deleteBtn)

    // Click to open with system default app
    const filePath = this.path
    wrapper.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.cm-widget-delete')) return
      openHint.textContent = ''
      openHint.style.opacity = '1'
      const spinner = document.createElement('span')
      spinner.style.display = 'inline-block'
      spinner.style.width = '10px'
      spinner.style.height = '10px'
      spinner.style.border = '2px solid #475569'
      spinner.style.borderTopColor = '#94a3b8'
      spinner.style.borderRadius = '50%'
      spinner.style.animation = 'cm-spin 0.6s linear infinite'
      openHint.appendChild(spinner)
      api.attachment.open(filePath).then(() => {
        openHint.textContent = 'Open'
      })
    })

    wrapper.addEventListener('mouseenter', () => {
      wrapper.style.borderColor = '#475569'
      wrapper.style.backgroundColor = '#253044'
      openHint.style.opacity = '1'
      const btn = wrapper.querySelector('.cm-widget-delete') as HTMLElement
      if (btn) btn.style.opacity = '1'
    })
    wrapper.addEventListener('mouseleave', () => {
      wrapper.style.borderColor = '#334155'
      wrapper.style.backgroundColor = '#1e293b'
      openHint.style.opacity = '0'
      const btn = wrapper.querySelector('.cm-widget-delete') as HTMLElement
      if (btn) btn.style.opacity = '0'
    })

    return wrapper
  }

  ignoreEvent(event: Event): boolean {
    return event.type !== 'mousedown' && event.type !== 'click'
  }
}

function createDeleteButton(view: EditorView, from: number, to: number): HTMLButtonElement {
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'cm-widget-delete'
  btn.title = 'Remove'
  btn.innerHTML = '✕'
  btn.style.position = 'absolute'
  btn.style.top = '8px'
  btn.style.right = '8px'
  btn.style.width = '20px'
  btn.style.height = '20px'
  btn.style.borderRadius = '50%'
  btn.style.border = 'none'
  btn.style.backgroundColor = 'rgba(0,0,0,0.7)'
  btn.style.color = '#e2e8f0'
  btn.style.fontSize = '11px'
  btn.style.cursor = 'pointer'
  btn.style.display = 'flex'
  btn.style.alignItems = 'center'
  btn.style.justifyContent = 'center'
  btn.style.opacity = '0'
  btn.style.transition = 'opacity 150ms'
  btn.style.flexShrink = '0'

  btn.addEventListener('mousedown', (e) => {
    e.preventDefault()
    e.stopPropagation()
    const docLen = view.state.doc.length
    const deleteEnd = to < docLen && view.state.doc.sliceString(to, to + 1) === '\n' ? to + 1 : to
    const deleteStart =
      from > 0 && view.state.doc.sliceString(from - 1, from) === '\n' ? from - 1 : from
    view.dispatch({ changes: { from: deleteStart, to: deleteEnd } })
  })

  return btn
}

function buildDecorations(view: EditorView): DecorationSet {
  const doc = view.state.doc.toString()
  const docLength = view.state.doc.length
  const links = findAttachmentLinks(doc)

  const builder = new RangeSetBuilder<Decoration>()

  for (const link of links) {
    if (link.from >= docLength || link.to > docLength) continue

    const line = view.state.doc.lineAt(link.from)
    const lineText = view.state.doc.sliceString(line.from, line.to).trim()
    const matchText = doc.slice(link.from, link.to)

    // Only replace if the link is the entire line content (standalone)
    if (lineText !== matchText) continue

    let widget: WidgetType
    if (link.isImage) {
      const src = resolveImageSrc(link.path)
      widget = new ImageWidget(src, link.name, line.from, line.to)
    } else {
      const ext = getFileExtension(link.path)
      widget = new FileWidget(link.name, ext, link.path, line.from, line.to)
    }

    builder.add(line.from, line.to, Decoration.replace({ widget }))
  }

  return builder.finish()
}

const imagePlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view)
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        try {
          this.decorations = buildDecorations(update.view)
        } catch {
          this.decorations = Decoration.none
        }
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  },
)

export function imageWidgetExtension() {
  return imagePlugin
}
