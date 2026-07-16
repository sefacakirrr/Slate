import type { EditorView } from 'codemirror'
import type { Alignment } from './highlight'

type WrapMarker = { prefix: string; suffix: string }

const FORMATS: Record<string, WrapMarker> = {
  bold: { prefix: '**', suffix: '**' },
  italic: { prefix: '_', suffix: '_' },
  underline: { prefix: '++', suffix: '++' },
  strikethrough: { prefix: '~~', suffix: '~~' },
  code: { prefix: '`', suffix: '`' },
}

export function toggleFormat(view: EditorView, format: keyof typeof FORMATS): void {
  const { from, to } = view.state.selection.main
  if (from === to) return

  const { prefix, suffix } = FORMATS[format]
  const doc = view.state.doc.toString()
  const selected = doc.slice(from, to)

  const beforeStart = from - prefix.length
  const afterEnd = to + suffix.length
  const hasBefore = beforeStart >= 0 && doc.slice(beforeStart, from) === prefix
  const hasAfter = afterEnd <= doc.length && doc.slice(to, afterEnd) === suffix

  if (hasBefore && hasAfter) {
    view.dispatch({
      changes: [
        { from: beforeStart, to: from, insert: '' },
        { from: to, to: afterEnd, insert: '' },
      ],
      selection: { anchor: beforeStart, head: beforeStart + selected.length },
    })
  } else if (
    selected.startsWith(prefix) &&
    selected.endsWith(suffix) &&
    selected.length > prefix.length + suffix.length
  ) {
    const inner = selected.slice(prefix.length, -suffix.length)
    view.dispatch({
      changes: { from, to, insert: inner },
      selection: { anchor: from, head: from + inner.length },
    })
  } else {
    view.dispatch({
      changes: { from, to, insert: `${prefix}${selected}${suffix}` },
      selection: { anchor: from + prefix.length, head: from + prefix.length + selected.length },
    })
  }
}

export type TextColor =
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'teal'
  | 'blue'
  | 'purple'
  | 'pink'
  | 'gray'
  | 'white'

export const TEXT_COLORS: TextColor[] = [
  'red',
  'orange',
  'yellow',
  'green',
  'teal',
  'blue',
  'purple',
  'pink',
  'gray',
  'white',
]

const CLOSE_TAG = '{/color}'
const CLOSE_TAG_LEN = CLOSE_TAG.length

export function findTextColors(doc: string) {
  const results: { from: number; to: number; text: string; color: TextColor }[] = []

  // Strategy: find each {/color}, then look backwards for the closest unmatched {color:X}
  const closers: number[] = []
  let searchFrom = 0
  while (true) {
    const idx = doc.indexOf(CLOSE_TAG, searchFrom)
    if (idx === -1) break
    closers.push(idx)
    searchFrom = idx + CLOSE_TAG_LEN
  }

  const openRe = /\{color:(\w+)\}/g
  const openers: { start: number; end: number; color: string }[] = []
  let om: RegExpExecArray | null = openRe.exec(doc)
  while (om !== null) {
    openers.push({ start: om.index, end: om.index + om[0].length, color: om[1] })
    om = openRe.exec(doc)
  }

  const usedOpeners = new Set<number>()
  const usedClosers = new Set<number>()

  // For each closer, find the nearest preceding opener that hasn't been used
  for (const closeIdx of closers) {
    let bestOpener: (typeof openers)[0] | null = null
    for (let i = openers.length - 1; i >= 0; i--) {
      const op = openers[i]
      if (op.end <= closeIdx && !usedOpeners.has(i)) {
        // Check no other unused closer between this opener and our closer
        let blocked = false
        for (const ci of closers) {
          if (ci > op.end && ci < closeIdx && !usedClosers.has(ci)) {
            blocked = true
            break
          }
        }
        if (!blocked) {
          bestOpener = op
          usedOpeners.add(i)
          usedClosers.add(closeIdx)
          break
        }
      }
    }

    if (bestOpener && TEXT_COLORS.includes(bestOpener.color as TextColor)) {
      results.push({
        from: bestOpener.start,
        to: closeIdx + CLOSE_TAG_LEN,
        text: doc.slice(bestOpener.end, closeIdx),
        color: bestOpener.color as TextColor,
      })
    }
  }

  results.sort((a, b) => a.from - b.from)
  return results
}

export function applyTextColor(view: EditorView, color: TextColor): void {
  const { from, to } = view.state.selection.main
  if (from === to) return

  const doc = view.state.doc.toString()
  const colorBlocks = findTextColors(doc)

  let enclosing: (typeof colorBlocks)[0] | null = null
  for (const block of colorBlocks) {
    const openTagLen = `{color:${block.color}}`.length
    const innerFrom = block.from + openTagLen
    const innerTo = block.to - CLOSE_TAG_LEN
    if (from >= innerFrom && to <= innerTo) {
      enclosing = block
      break
    }
  }

  if (enclosing) {
    const openTag = `{color:${enclosing.color}}`
    const innerFrom = enclosing.from + openTag.length
    const innerTo = enclosing.to - CLOSE_TAG_LEN

    const beforeSel = doc.slice(innerFrom, from)
    const selectedText = doc.slice(from, to)
    const afterSel = doc.slice(to, innerTo)

    const cleanSelected = selectedText.replace(/\{color:\w+\}/g, '').replace(/\{\/color\}/g, '')

    let result = ''
    if (beforeSel) result += `{color:${enclosing.color}}${beforeSel}{/color}`
    result += `{color:${color}}${cleanSelected}{/color}`
    if (afterSel) result += `{color:${enclosing.color}}${afterSel}{/color}`

    const beforeLen = beforeSel ? `{color:${enclosing.color}}${beforeSel}{/color}`.length : 0
    const newSelStart = enclosing.from + beforeLen + `{color:${color}}`.length

    view.dispatch({
      changes: { from: enclosing.from, to: enclosing.to, insert: result },
      selection: { anchor: newSelStart, head: newSelStart + cleanSelected.length },
    })
  } else {
    let effectiveFrom = from
    let effectiveTo = to

    for (const block of colorBlocks) {
      const openTagLen = `{color:${block.color}}`.length
      const innerFrom = block.from + openTagLen
      const innerTo = block.to - CLOSE_TAG_LEN
      if (from < innerTo && to > innerFrom) {
        effectiveFrom = Math.min(effectiveFrom, block.from)
        effectiveTo = Math.max(effectiveTo, block.to)
      }
    }

    let selected = doc.slice(effectiveFrom, effectiveTo)
    selected = selected.replace(/\{color:\w+\}/g, '').replace(/\{\/color\}/g, '')

    view.dispatch({
      changes: {
        from: effectiveFrom,
        to: effectiveTo,
        insert: `{color:${color}}${selected}{/color}`,
      },
      selection: {
        anchor: effectiveFrom + 8 + color.length,
        head: effectiveFrom + 8 + color.length + selected.length,
      },
    })
  }
}

export function removeTextColor(view: EditorView): void {
  const { from, to } = view.state.selection.main
  const doc = view.state.doc.toString()
  const results = findTextColors(doc)

  // Find a color block that contains the selection
  for (const r of results) {
    if (r.from <= from && r.to >= to) {
      view.dispatch({
        changes: { from: r.from, to: r.to, insert: r.text },
        selection: { anchor: r.from, head: r.from + r.text.length },
      })
      return
    }
  }

  // Fallback: strip all color markers in the selection range
  if (from < to) {
    const text = view.state.sliceDoc(from, to)
    const cleaned = text.replace(/\{color:\w+\}/g, '').replace(/\{\/color\}/g, '')
    if (cleaned !== text) {
      view.dispatch({
        changes: { from, to, insert: cleaned },
        selection: { anchor: from, head: from + cleaned.length },
      })
    }
  }
}

export function removeAllFormatting(view: EditorView): void {
  const { from, to } = view.state.selection.main
  if (from === to) return

  let text = view.state.sliceDoc(from, to)

  text = text.replace(/\*\*([^*]+)\*\*/g, '$1')
  text = text.replace(/(?<!\w)_([^_]+)_(?!\w)/g, '$1')
  text = text.replace(/\+\+([^+]+)\+\+/g, '$1')
  text = text.replace(/~~([^~]+)~~/g, '$1')
  text = text.replace(/`([^`]+)`/g, '$1')
  text = text.replace(/==([^=]+)==\{\.\w+\}/g, '$1')
  text = text.replace(/\{color:\w+\}/g, '')
  text = text.replace(/\{\/color\}/g, '')
  text = text.replace(/\{size:\d+\}/g, '')
  text = text.replace(/\{\/size\}/g, '')
  text = text.replace(/^\{align:(left|center|right)\}/gm, '')

  if (text !== view.state.sliceDoc(from, to)) {
    view.dispatch({
      changes: { from, to, insert: text },
      selection: { anchor: from, head: from + text.length },
    })
  }
}

// Alignment

const ALIGN_MARKER_RE = /^\{align:(left|center|right)\}/

export function setAlignment(view: EditorView, align: Alignment): void {
  const { from, to } = view.state.selection.main
  const doc = view.state.doc

  const startLine = doc.lineAt(from)
  const endLine = doc.lineAt(to)

  const changes: { from: number; to: number; insert: string }[] = []

  for (let lineNum = startLine.number; lineNum <= endLine.number; lineNum++) {
    const line = doc.line(lineNum)
    const lineText = line.text
    const existingMatch = lineText.match(ALIGN_MARKER_RE)

    if (existingMatch) {
      const markerEnd = line.from + existingMatch[0].length
      if (align === 'left') {
        changes.push({ from: line.from, to: markerEnd, insert: '' })
      } else {
        changes.push({ from: line.from, to: markerEnd, insert: `{align:${align}}` })
      }
    } else if (align !== 'left') {
      changes.push({ from: line.from, to: line.from, insert: `{align:${align}}` })
    }
  }

  if (changes.length > 0) {
    view.dispatch({ changes })
  }
}

export function getLineAlignment(view: EditorView): Alignment {
  const { from } = view.state.selection.main
  const line = view.state.doc.lineAt(from)
  const match = line.text.match(ALIGN_MARKER_RE)
  return match ? (match[1] as Alignment) : 'left'
}

const SIZE_OPEN_RE = /\{size:(\d+)\}/g
const SIZE_CLOSE_TAG = '{/size}'

export function applyFontSizeInline(view: EditorView, size: number): void {
  const { from, to } = view.state.selection.main
  if (from === to) return

  const doc = view.state.doc.toString()

  let effectiveFrom = from
  let effectiveTo = to

  const sizeOpenRe = /\{size:\d+\}/g
  let m: RegExpExecArray | null = sizeOpenRe.exec(doc)
  while (m !== null) {
    const closeIdx = doc.indexOf(SIZE_CLOSE_TAG, m.index + m[0].length)
    if (closeIdx !== -1) {
      const blockFrom = m.index
      const blockTo = closeIdx + SIZE_CLOSE_TAG.length
      if (from < blockTo && to > blockFrom) {
        effectiveFrom = Math.min(effectiveFrom, blockFrom)
        effectiveTo = Math.max(effectiveTo, blockTo)
      }
    }
    m = sizeOpenRe.exec(doc)
  }

  let selected = doc.slice(effectiveFrom, effectiveTo)
  selected = selected.replace(/\{size:\d+\}/g, '').replace(/\{\/size\}/g, '')

  const insert = `{size:${size}}${selected}{/size}`
  view.dispatch({
    changes: { from: effectiveFrom, to: effectiveTo, insert },
    selection: {
      anchor: effectiveFrom + `{size:${size}}`.length,
      head: effectiveFrom + `{size:${size}}`.length + selected.length,
    },
  })
}

export function removeFontSizeInline(view: EditorView): void {
  const { from, to } = view.state.selection.main
  if (from === to) return

  const doc = view.state.doc.toString()
  const text = doc.slice(from, to)
  const cleaned = text.replace(/\{size:\d+\}/g, '').replace(/\{\/size\}/g, '')
  if (cleaned !== text) {
    view.dispatch({
      changes: { from, to, insert: cleaned },
      selection: { anchor: from, head: from + cleaned.length },
    })
  }
}

const TASK_LINE_RE = /^(\s*)[-*+]\s\[[ xX]\]\s?/

export function toggleChecklist(view: EditorView): void {
  const { from, to } = view.state.selection.main
  const doc = view.state.doc

  const startLine = doc.lineAt(from)
  const endLine = doc.lineAt(to)

  const changes: { from: number; to: number; insert: string }[] = []
  let allAreChecklists = true

  for (let lineNum = startLine.number; lineNum <= endLine.number; lineNum++) {
    const line = doc.line(lineNum)
    if (!TASK_LINE_RE.test(line.text)) {
      allAreChecklists = false
      break
    }
  }

  for (let lineNum = startLine.number; lineNum <= endLine.number; lineNum++) {
    const line = doc.line(lineNum)
    if (allAreChecklists) {
      const match = line.text.match(TASK_LINE_RE)
      if (match) {
        changes.push({ from: line.from, to: line.from + match[0].length, insert: match[1] })
      }
    } else {
      const existing = line.text.match(TASK_LINE_RE)
      if (!existing) {
        const indentMatch = line.text.match(/^(\s*)/)
        const indent = indentMatch ? indentMatch[1] : ''
        const contentStart = line.from + indent.length
        changes.push({ from: line.from, to: contentStart, insert: `${indent}- [ ] ` })
      }
    }
  }

  if (changes.length > 0) {
    view.dispatch({ changes })
  }
}
