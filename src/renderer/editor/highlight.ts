import { RangeSetBuilder } from '@codemirror/state'
import { Decoration, type DecorationSet, type EditorView, ViewPlugin } from '@codemirror/view'
import { findTextColors, type TextColor } from './formatting'

export type HighlightColor =
  | 'yellow'
  | 'green'
  | 'blue'
  | 'pink'
  | 'orange'
  | 'red'
  | 'purple'
  | 'teal'
  | 'gray'

export const HIGHLIGHT_COLORS: HighlightColor[] = [
  'yellow',
  'orange',
  'red',
  'pink',
  'purple',
  'blue',
  'teal',
  'green',
  'gray',
]

const BG_COLORS: Record<HighlightColor, { dark: string; light: string }> = {
  yellow: { dark: 'rgba(250, 204, 21, 0.25)', light: 'rgba(250, 204, 21, 0.4)' },
  orange: { dark: 'rgba(251, 146, 60, 0.25)', light: 'rgba(251, 146, 60, 0.4)' },
  red: { dark: 'rgba(248, 113, 113, 0.25)', light: 'rgba(239, 68, 68, 0.35)' },
  pink: { dark: 'rgba(244, 114, 182, 0.25)', light: 'rgba(244, 114, 182, 0.4)' },
  purple: { dark: 'rgba(192, 132, 252, 0.25)', light: 'rgba(168, 85, 247, 0.3)' },
  blue: { dark: 'rgba(96, 165, 250, 0.25)', light: 'rgba(96, 165, 250, 0.4)' },
  teal: { dark: 'rgba(45, 212, 191, 0.25)', light: 'rgba(20, 184, 166, 0.35)' },
  green: { dark: 'rgba(74, 222, 128, 0.25)', light: 'rgba(74, 222, 128, 0.4)' },
  gray: { dark: 'rgba(148, 163, 184, 0.2)', light: 'rgba(100, 116, 139, 0.2)' },
}

const TEXT_COLOR_VALUES: Record<TextColor, { dark: string; light: string }> = {
  red: { dark: '#f87171', light: '#dc2626' },
  orange: { dark: '#fb923c', light: '#ea580c' },
  yellow: { dark: '#fbbf24', light: '#b45309' },
  green: { dark: '#4ade80', light: '#16a34a' },
  teal: { dark: '#2dd4bf', light: '#0d9488' },
  blue: { dark: '#60a5fa', light: '#2563eb' },
  purple: { dark: '#c084fc', light: '#9333ea' },
  pink: { dark: '#f472b6', light: '#db2777' },
  gray: { dark: '#94a3b8', light: '#64748b' },
  white: { dark: '#f1f5f9', light: '#1e293b' },
}

const HIGHLIGHT_RE = /==([^=]+)==\{\.(\w+)\}/g
const BOLD_RE = /\*\*([^*]+)\*\*/g
const ITALIC_RE = /(?<!\w)_([^_]+)_(?!\w)/g
const UNDERLINE_RE = /\+\+([^+]+)\+\+/g
const STRIKE_RE = /~~([^~]+)~~/g
const CODE_RE = /`([^`]+)`/g
const ALIGN_RE = /^\{align:(left|center|right)\}/gm

export type Alignment = 'left' | 'center' | 'right'

export function findHighlights(doc: string) {
  const results: { from: number; to: number; text: string; color: HighlightColor }[] = []
  let match: RegExpExecArray | null = HIGHLIGHT_RE.exec(doc)
  while (match !== null) {
    const color = match[2] as HighlightColor
    if (HIGHLIGHT_COLORS.includes(color)) {
      results.push({
        from: match.index,
        to: match.index + match[0].length,
        text: match[1],
        color,
      })
    }
    match = HIGHLIGHT_RE.exec(doc)
  }
  HIGHLIGHT_RE.lastIndex = 0
  return results
}

export function findAlignments(doc: string) {
  const results: { from: number; to: number; align: Alignment }[] = []
  let match: RegExpExecArray | null = ALIGN_RE.exec(doc)
  while (match !== null) {
    results.push({
      from: match.index,
      to: match.index + match[0].length,
      align: match[1] as Alignment,
    })
    match = ALIGN_RE.exec(doc)
  }
  ALIGN_RE.lastIndex = 0
  return results
}

type ReplaceRange = { from: number; to: number }
type MarkRange = { from: number; to: number; style: string }

interface InlineMatch {
  replaces: ReplaceRange[]
  marks: MarkRange[]
}

function collectInline(doc: string, re: RegExp, markerLen: number, style: string): InlineMatch {
  const replaces: ReplaceRange[] = []
  const marks: MarkRange[] = []
  let match: RegExpExecArray | null = re.exec(doc)
  while (match !== null) {
    const start = match.index
    const end = start + match[0].length
    replaces.push({ from: start, to: start + markerLen })
    replaces.push({ from: end - markerLen, to: end })
    marks.push({ from: start + markerLen, to: end - markerLen, style })
    match = re.exec(doc)
  }
  re.lastIndex = 0
  return { replaces, marks }
}

function buildDecorations(view: EditorView): DecorationSet {
  const doc = view.state.doc.toString()
  const isDark = document.documentElement.classList.contains('dark')

  const allReplaces: ReplaceRange[] = []
  const allMarks: MarkRange[] = []

  // Bold
  const bold = collectInline(doc, BOLD_RE, 2, 'font-weight: 700;')
  allReplaces.push(...bold.replaces)
  allMarks.push(...bold.marks)

  // Italic
  const italic = collectInline(doc, ITALIC_RE, 1, 'font-style: italic;')
  allReplaces.push(...italic.replaces)
  allMarks.push(...italic.marks)

  // Underline
  const underline = collectInline(doc, UNDERLINE_RE, 2, 'text-decoration: underline;')
  allReplaces.push(...underline.replaces)
  allMarks.push(...underline.marks)

  // Strikethrough
  const strike = collectInline(doc, STRIKE_RE, 2, 'text-decoration: line-through; opacity: 0.6;')
  allReplaces.push(...strike.replaces)
  allMarks.push(...strike.marks)

  // Inline code
  const codeBg = isDark ? 'rgba(100, 116, 139, 0.3)' : 'rgba(100, 116, 139, 0.15)'
  const code = collectInline(
    doc,
    CODE_RE,
    1,
    `background-color: ${codeBg}; border-radius: 3px; padding: 1px 4px; font-size: 0.9em;`,
  )
  allReplaces.push(...code.replaces)
  allMarks.push(...code.marks)

  // Background highlights: ==text=={.color}
  const highlights = findHighlights(doc)
  for (const h of highlights) {
    const bg = isDark ? BG_COLORS[h.color].dark : BG_COLORS[h.color].light
    allReplaces.push({ from: h.from, to: h.from + 2 })
    allReplaces.push({ from: h.from + 2 + h.text.length, to: h.to })
    allMarks.push({
      from: h.from + 2,
      to: h.from + 2 + h.text.length,
      style: `background-color: ${bg}; border-radius: 2px; padding: 1px 0;`,
    })
  }

  // Text colors: {color:name}text{/color} (supports multiline content)
  const textColors = findTextColors(doc)
  for (const tc of textColors) {
    const colorVal = isDark ? TEXT_COLOR_VALUES[tc.color].dark : TEXT_COLOR_VALUES[tc.color].light
    const prefixLen = 7 + tc.color.length + 1 // {color:X}
    const suffixLen = 8 // {/color}
    allReplaces.push({ from: tc.from, to: tc.from + prefixLen })
    allReplaces.push({ from: tc.to - suffixLen, to: tc.to })
    allMarks.push({
      from: tc.from + prefixLen,
      to: tc.to - suffixLen,
      style: `color: ${colorVal};`,
    })
  }

  // Alignment markers: {align:X} at line start — hide marker, apply line style
  const alignments = findAlignments(doc)
  for (const a of alignments) {
    allReplaces.push({ from: a.from, to: a.to })
  }

  // Sort replaces and remove overlaps (replace decorations cannot overlap)
  allReplaces.sort((a, b) => a.from - b.from || a.to - b.to)
  const filteredReplaces: ReplaceRange[] = []
  let lastReplaceEnd = 0
  for (const r of allReplaces) {
    if (r.from >= lastReplaceEnd && r.from < r.to) {
      filteredReplaces.push(r)
      lastReplaceEnd = r.to
    }
  }

  // Marks can overlap in CM6, no filtering needed — just sort
  allMarks.sort((a, b) => a.from - b.from || a.to - b.to)

  // Merge into a single sorted decoration list for RangeSetBuilder
  type Deco = { from: number; to: number; deco: Decoration; isLine?: boolean }
  const all: Deco[] = []
  for (const r of filteredReplaces) {
    all.push({ from: r.from, to: r.to, deco: Decoration.replace({}) })
  }
  for (const m of allMarks) {
    if (m.from < m.to) {
      all.push({
        from: m.from,
        to: m.to,
        deco: Decoration.mark({ attributes: { style: m.style } }),
      })
    }
  }

  // Line decorations for alignment (these must be added at line.from with from===to)
  const lineDecos: { pos: number; deco: Decoration }[] = []
  for (const a of alignments) {
    if (a.align !== 'left') {
      const line = view.state.doc.lineAt(a.from)
      lineDecos.push({
        pos: line.from,
        deco: Decoration.line({ attributes: { style: `text-align: ${a.align};` } }),
      })
    }
  }

  all.sort((a, b) => a.from - b.from || a.to - b.to)

  const builder = new RangeSetBuilder<Decoration>()

  // Add line decorations first (they go at pos, pos — zero-width)
  // We need to interleave them with the range decorations
  lineDecos.sort((a, b) => a.pos - b.pos)
  let lineIdx = 0

  for (const d of all) {
    // Add any line decos that come before this range deco
    while (lineIdx < lineDecos.length && lineDecos[lineIdx].pos <= d.from) {
      builder.add(lineDecos[lineIdx].pos, lineDecos[lineIdx].pos, lineDecos[lineIdx].deco)
      lineIdx++
    }
    builder.add(d.from, d.to, d.deco)
  }
  // Add remaining line decos
  while (lineIdx < lineDecos.length) {
    builder.add(lineDecos[lineIdx].pos, lineDecos[lineIdx].pos, lineDecos[lineIdx].deco)
    lineIdx++
  }

  return builder.finish()
}

export const highlightExtension = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view)
    }
    update(update: { docChanged: boolean; view: EditorView; selectionSet: boolean }) {
      if (update.docChanged || update.selectionSet) {
        this.decorations = buildDecorations(update.view)
      }
    }
  },
  { decorations: (v) => v.decorations },
)

export function applyHighlight(view: EditorView, color: HighlightColor): void {
  const { from, to } = view.state.selection.main
  if (from === to) return

  const doc = view.state.doc.toString()
  const highlights = findHighlights(doc)

  let enclosing: (typeof highlights)[0] | null = null
  for (const h of highlights) {
    const innerFrom = h.from + 2
    const innerTo = h.to - `=={.${h.color}}`.length
    if (from >= innerFrom && to <= innerTo) {
      enclosing = h
      break
    }
  }

  if (enclosing) {
    const innerFrom = enclosing.from + 2
    const suffixLen = `=={.${enclosing.color}}`.length
    const innerTo = enclosing.to - suffixLen

    const beforeSel = doc.slice(innerFrom, from)
    const selectedText = doc.slice(from, to)
    const afterSel = doc.slice(to, innerTo)

    const cleanSelected = selectedText.replace(/==([^=]+)==\{\.\w+\}/g, '$1')

    let result = ''
    if (beforeSel) result += `==${beforeSel}=={.${enclosing.color}}`
    result += `==${cleanSelected}=={.${color}}`
    if (afterSel) result += `==${afterSel}=={.${enclosing.color}}`

    const beforeLen = beforeSel ? `==${beforeSel}=={.${enclosing.color}}`.length : 0
    const newSelStart = enclosing.from + beforeLen + 2

    view.dispatch({
      changes: { from: enclosing.from, to: enclosing.to, insert: result },
      selection: { anchor: newSelStart, head: newSelStart + cleanSelected.length },
    })
  } else {
    let effectiveFrom = from
    let effectiveTo = to

    for (const h of highlights) {
      const innerFrom = h.from + 2
      const suffixLen = `=={.${h.color}}`.length
      const innerTo = h.to - suffixLen
      if (from < innerTo && to > innerFrom) {
        effectiveFrom = Math.min(effectiveFrom, h.from)
        effectiveTo = Math.max(effectiveTo, h.to)
      }
    }

    let selected = doc.slice(effectiveFrom, effectiveTo)
    selected = selected.replace(/==([^=]+)==\{\.\w+\}/g, '$1')

    view.dispatch({
      changes: { from: effectiveFrom, to: effectiveTo, insert: `==${selected}=={.${color}}` },
      selection: { anchor: effectiveFrom + 2, head: effectiveFrom + 2 + selected.length },
    })
  }
}

export function removeHighlight(view: EditorView): void {
  const { from, to } = view.state.selection.main
  const doc = view.state.doc.toString()

  const highlights = findHighlights(doc)
  for (const h of highlights) {
    if (h.from <= from && h.to >= to) {
      view.dispatch({
        changes: { from: h.from, to: h.to, insert: h.text },
        selection: { anchor: h.from, head: h.from + h.text.length },
      })
      return
    }
  }
}
