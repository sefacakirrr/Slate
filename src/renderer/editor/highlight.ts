import { syntaxTree } from '@codemirror/language'
import {
  ChangeSet,
  EditorSelection,
  EditorState,
  type Extension,
  type Range,
  Transaction,
  type TransactionSpec,
} from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view'
import {
  type FormatTarget,
  findFontSizes,
  findTextColors,
  formatDispatch,
  removeAllFormatting,
  removeFontSizeInline,
  removeTextColor,
  type TextColor,
} from './formatting'

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

// Inline markers may continue across a soft line break (same paragraph) but
// never across a blank line — otherwise a stray marker pairs with one several
// paragraphs away and both render wrong. `(?:X|\n(?![ \t]*\n))` reads "X, or a
// newline not followed by an empty line".
const HIGHLIGHT_RE = /==((?:[^=\n]|\n(?![ \t]*\n))+)==\{\.(\w+)\}/g
const BOLD_RE = /\*\*((?:[^*\n]|\n(?![ \t]*\n))+)\*\*/g
const ITALIC_RE = /(?<!\w)_((?:[^_\n]|\n(?![ \t]*\n))+)_(?!\w)/g
const UNDERLINE_RE = /\+\+((?:[^+\n]|\n(?![ \t]*\n))+)\+\+/g
const STRIKE_RE = /~~((?:[^~\n]|\n(?![ \t]*\n))+)~~/g
// Inline code is single-line only and a lone backtick pair, never part of a
// ``` run (fence lines are masked out before this runs anyway).
const CODE_RE = /(?<!`)`([^`\n]+)`(?!`)/g
const ALIGN_RE = /^\{align:(left|center|right)\}/gm

export type Alignment = 'left' | 'center' | 'right'

export function findHighlights(doc: string) {
  const results: { from: number; to: number; text: string; color: HighlightColor }[] = []
  HIGHLIGHT_RE.lastIndex = 0
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
  ALIGN_RE.lastIndex = 0
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

export type TextRange = { from: number; to: number }

const FENCE_OPEN_RE = /^ {0,3}(`{3,}|~{3,})/
const FENCE_CLOSE_RE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/

/**
 * Fenced code blocks (``` or ~~~), found by a line scan so it also works for
 * plain `.txt` notes and for regions the incremental markdown parser hasn't
 * reached yet. Each range runs from the opening fence's line start to the
 * closing fence's line end; an unclosed fence runs to the end of the document
 * (CommonMark).
 */
export function findFencedCode(doc: string): TextRange[] {
  const ranges: TextRange[] = []
  let pos = 0
  let open: { from: number; char: string; len: number } | null = null
  while (true) {
    let end = doc.indexOf('\n', pos)
    if (end === -1) end = doc.length
    const line = doc.slice(pos, end)
    if (open === null) {
      const m = FENCE_OPEN_RE.exec(line)
      // A backtick fence's info string can't itself contain backticks.
      if (m && !(m[1][0] === '`' && line.slice(m[0].length).includes('`'))) {
        open = { from: pos, char: m[1][0], len: m[1].length }
      }
    } else {
      const m = FENCE_CLOSE_RE.exec(line)
      if (m && m[1][0] === open.char && m[1].length >= open.len) {
        ranges.push({ from: open.from, to: end })
        open = null
      }
    }
    if (end === doc.length) break
    pos = end + 1
  }
  if (open !== null) ranges.push({ from: open.from, to: doc.length })
  return ranges
}

/** Replaces every non-newline character inside `ranges` with a space (length-preserving). */
function maskRanges(doc: string, ranges: TextRange[]): string {
  if (ranges.length === 0) return doc
  const chars = doc.split('')
  for (const r of ranges) {
    const end = Math.min(chars.length, r.to)
    for (let i = Math.max(0, r.from); i < end; i++) {
      if (chars[i] !== '\n') chars[i] = ' '
    }
  }
  return chars.join('')
}

export type StyledRange =
  | { from: number; to: number; kind: 'bold' | 'italic' | 'underline' | 'strike' | 'code' }
  | { from: number; to: number; kind: 'highlight'; color: HighlightColor }
  | { from: number; to: number; kind: 'color'; color: TextColor }
  | { from: number; to: number; kind: 'size'; size: number }

export interface Markup {
  /** Marker text to hide. Sorted and non-overlapping (overlaps are merged). */
  hidden: TextRange[]
  /** Text between markers to style. May nest/overlap. */
  styled: StyledRange[]
  /** `{align:X}` markers at line starts. */
  aligns: { from: number; to: number; align: Alignment }[]
}

export interface CodeHints {
  /** Block code known from the syntax tree (FencedCode / CodeBlock). */
  block?: TextRange[]
  /** Inline code known from the syntax tree (InlineCode). */
  inline?: TextRange[]
}

/**
 * Pure core of the marker renderer: which marker characters to hide and which
 * spans to style. Nothing inside code (fenced, indented, or inline) is treated
 * as a formatting marker — code is shown verbatim.
 */
export function collectMarkup(doc: string, hints: CodeHints = {}): Markup {
  const hidden: TextRange[] = []
  const styled: StyledRange[] = []

  const withoutBlocks = maskRanges(doc, [...findFencedCode(doc), ...(hints.block ?? [])])

  // Inline code: style it and hide its backticks, then mask it (plus any
  // tree-known inline code) so no other marker can match inside it.
  const inlineCode: TextRange[] = [...(hints.inline ?? [])]
  CODE_RE.lastIndex = 0
  for (let m = CODE_RE.exec(withoutBlocks); m !== null; m = CODE_RE.exec(withoutBlocks)) {
    const from = m.index
    const to = from + m[0].length
    hidden.push({ from, to: from + 1 }, { from: to - 1, to })
    styled.push({ from: from + 1, to: to - 1, kind: 'code' })
    inlineCode.push({ from, to })
  }
  CODE_RE.lastIndex = 0
  const text = maskRanges(withoutBlocks, inlineCode)

  const inline: [RegExp, number, 'bold' | 'italic' | 'underline' | 'strike'][] = [
    [BOLD_RE, 2, 'bold'],
    [ITALIC_RE, 1, 'italic'],
    [UNDERLINE_RE, 2, 'underline'],
    [STRIKE_RE, 2, 'strike'],
  ]
  for (const [re, len, kind] of inline) {
    re.lastIndex = 0
    for (let m = re.exec(text); m !== null; m = re.exec(text)) {
      const from = m.index
      const to = from + m[0].length
      hidden.push({ from, to: from + len }, { from: to - len, to })
      styled.push({ from: from + len, to: to - len, kind })
    }
    re.lastIndex = 0
  }

  for (const h of findHighlights(text)) {
    const innerTo = h.from + 2 + h.text.length
    hidden.push({ from: h.from, to: h.from + 2 }, { from: innerTo, to: h.to })
    styled.push({ from: h.from + 2, to: innerTo, kind: 'highlight', color: h.color })
  }

  for (const tc of findTextColors(text)) {
    const prefixLen = `{color:${tc.color}}`.length
    const suffixLen = '{/color}'.length
    hidden.push({ from: tc.from, to: tc.from + prefixLen }, { from: tc.to - suffixLen, to: tc.to })
    styled.push({
      from: tc.from + prefixLen,
      to: tc.to - suffixLen,
      kind: 'color',
      color: tc.color,
    })
  }

  for (const s of findFontSizes(text)) {
    hidden.push({ from: s.from, to: s.innerFrom }, { from: s.innerTo, to: s.to })
    styled.push({ from: s.innerFrom, to: s.innerTo, kind: 'size', size: s.size })
  }

  const aligns = findAlignments(text)
  for (const a of aligns) hidden.push({ from: a.from, to: a.to })

  return { hidden: mergeRanges(hidden), styled: styled.filter((s) => s.from < s.to), aligns }
}

/**
 * Sorts and unions overlapping ranges. Replace decorations may not overlap, and
 * the old behaviour (dropping the later of two overlapping ranges) left that
 * marker visible as raw text. Both are marker characters, so hiding the union
 * is correct.
 */
function mergeRanges(ranges: TextRange[]): TextRange[] {
  const sorted = ranges.filter((r) => r.from < r.to).sort((a, b) => a.from - b.from || a.to - b.to)
  const out: TextRange[] = []
  for (const r of sorted) {
    const last = out[out.length - 1]
    if (last !== undefined && r.from < last.to) {
      last.to = Math.max(last.to, r.to)
    } else {
      out.push({ from: r.from, to: r.to })
    }
  }
  return out
}

/** Code regions the markdown parser knows about (empty for non-markdown docs). */
function codeHintsFromTree(state: EditorState): CodeHints {
  const block: TextRange[] = []
  const inline: TextRange[] = []
  syntaxTree(state).iterate({
    enter(node) {
      if (node.name === 'FencedCode' || node.name === 'CodeBlock') {
        block.push({ from: node.from, to: node.to })
        return false
      }
      if (node.name === 'InlineCode') {
        inline.push({ from: node.from, to: node.to })
        return false
      }
      return undefined
    },
  })
  return { block, inline }
}

function styleFor(s: StyledRange, isDark: boolean): string {
  switch (s.kind) {
    case 'bold':
      return 'font-weight: 700;'
    case 'italic':
      return 'font-style: italic;'
    case 'underline':
      return 'text-decoration: underline;'
    case 'strike':
      return 'text-decoration: line-through; opacity: 0.6;'
    case 'code': {
      const codeBg = isDark ? 'rgba(100, 116, 139, 0.3)' : 'rgba(100, 116, 139, 0.15)'
      return `background-color: ${codeBg}; border-radius: 3px; padding: 1px 4px; font-size: 0.9em;`
    }
    case 'highlight': {
      const bg = isDark ? BG_COLORS[s.color].dark : BG_COLORS[s.color].light
      return `background-color: ${bg}; border-radius: 2px; padding: 1px 0;`
    }
    case 'color':
      return `color: ${isDark ? TEXT_COLOR_VALUES[s.color].dark : TEXT_COLOR_VALUES[s.color].light};`
    case 'size':
      return `font-size: ${s.size}px;`
  }
}

const hiddenDeco = Decoration.replace({})

function buildDecorations(state: EditorState): {
  decorations: DecorationSet
  hidden: DecorationSet
} {
  const isDark = document.documentElement.classList.contains('dark')
  const markup = collectMarkup(state.doc.toString(), codeHintsFromTree(state))

  const hiddenRanges: Range<Decoration>[] = markup.hidden.map((r) => hiddenDeco.range(r.from, r.to))
  const all: Range<Decoration>[] = [...hiddenRanges]
  for (const s of markup.styled) {
    all.push(Decoration.mark({ attributes: { style: styleFor(s, isDark) } }).range(s.from, s.to))
  }
  for (const a of markup.aligns) {
    if (a.align === 'left') continue
    const line = state.doc.lineAt(a.from)
    all.push(Decoration.line({ attributes: { style: `text-align: ${a.align};` } }).range(line.from))
  }

  return { decorations: Decoration.set(all, true), hidden: Decoration.set(hiddenRanges, true) }
}

const markerPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    hidden: DecorationSet
    constructor(view: EditorView) {
      const built = buildDecorations(view.state)
      this.decorations = built.decorations
      this.hidden = built.hidden
    }
    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.selectionSet ||
        update.transactions.some((tr) => tr.reconfigured) ||
        syntaxTree(update.startState) !== syntaxTree(update.state)
      ) {
        const built = buildDecorations(update.state)
        this.decorations = built.decorations
        this.hidden = built.hidden
      }
    }
  },
  { decorations: (v) => v.decorations },
)

/**
 * Renders the custom formatting markers (hidden markers + styled text). Hidden
 * markers are also atomic, so the caret can never land between e.g. the two
 * `*` of a hidden `**` — typing there would break the pair and expose it.
 */
export const highlightExtension: Extension = [
  markerPlugin,
  EditorView.atomicRanges.of((view) => view.plugin(markerPlugin)?.hidden ?? Decoration.none),
  EditorState.transactionFilter.of((tr) => markerDeletionFilter(tr)),
]

type MarkedSpan = { open: TextRange; close: TextRange }

/** Styled spans with the hidden ranges that hold their opening/closing markers. */
function markedSpans(markup: Markup): MarkedSpan[] {
  const at = (pos: number) => markup.hidden.find((h) => h.from <= pos && pos < h.to)
  const out: MarkedSpan[] = []
  for (const s of markup.styled) {
    const open = at(s.from - 1)
    const close = at(s.to)
    if (open && close) out.push({ open, close })
  }
  return out
}

/**
 * Turns a user deletion into the ranges that should really be deleted so that
 * no hidden marker is left orphaned (an orphan stops pairing and shows up as
 * raw text, e.g. `**bold` after its closing `**` was deleted):
 *
 * - A one-character Backspace/Delete that only hit a hidden inline marker
 *   (atomic, so CodeMirror deletes it whole) deletes the next visible
 *   character beyond the marker instead.
 * - Deleting all the visible text of a span deletes its markers too.
 * - Markers of a span that is only partly deleted are kept.
 *
 * `dir` is the direction of a single-character delete, null for a range delete.
 */
export function planMarkerDeletion(
  doc: string,
  markup: Markup,
  del: TextRange,
  dir: 'backward' | 'forward' | null,
): TextRange[] {
  let { from, to } = del
  if (from >= to) return [del]
  const hiddenAt = (pos: number) => markup.hidden.find((h) => h.from <= pos && pos < h.to)
  const isAllHidden = (a: number, b: number) => {
    for (let p = a; p < b; ) {
      const h = hiddenAt(p)
      if (!h) return false
      p = h.to
    }
    return true
  }
  const touchesAlign = (a: number, b: number) => markup.aligns.some((x) => x.from < b && a < x.to)

  if (dir !== null && isAllHidden(from, to)) {
    if (dir === 'backward') {
      let p = from
      for (let h = hiddenAt(p - 1); h; h = hiddenAt(p - 1)) p = h.from
      // Backspace at a line's start removes its alignment, as before.
      if (touchesAlign(p, to)) return [del]
      if (p === 0) return []
      const low = doc.charCodeAt(p - 1)
      const pair = p >= 2 && low >= 0xdc00 && low <= 0xdfff
      from = pair ? p - 2 : p - 1
      to = p
    } else {
      let p = to
      for (let h = hiddenAt(p); h; h = hiddenAt(p)) p = h.to
      if (touchesAlign(from, p)) return [del]
      if (p >= doc.length) return []
      const high = doc.charCodeAt(p)
      const pair = high >= 0xd800 && high <= 0xdbff && p + 1 < doc.length
      from = p
      to = pair ? p + 2 : p + 1
    }
  }

  // A span whose visible text is entirely deleted goes with its markers.
  const spans = markedSpans(markup)
  for (let grew = true; grew; ) {
    grew = false
    for (const s of spans) {
      const content = { from: s.open.to, to: s.close.from }
      if (from <= content.from && content.to <= to && (s.open.from < from || s.close.to > to)) {
        from = Math.min(from, s.open.from)
        to = Math.max(to, s.close.to)
        grew = true
      }
    }
  }

  // Keep the markers of spans that survive the deletion.
  const keep: TextRange[] = []
  for (const h of markup.hidden) {
    if (h.to <= from || h.from >= to) continue
    const owners = spans.filter((s) => s.open === h || s.close === h)
    let deletable: boolean
    if (owners.length > 0) {
      deletable = owners.every((s) => from <= s.open.from && s.close.to <= to)
    } else {
      // `{align:X}`: goes with the line break before it, or with the whole line.
      const lineEnd = doc.indexOf('\n', h.to)
      deletable = from < h.from || to >= (lineEnd === -1 ? doc.length : lineEnd)
    }
    if (!deletable) keep.push(h)
  }
  const out: TextRange[] = []
  let cur = from
  for (const k of keep) {
    if (k.from > cur) out.push({ from: cur, to: Math.min(k.from, to) })
    cur = Math.max(cur, k.to)
  }
  if (cur < to) out.push({ from: cur, to })
  return out
}

function markerDeletionFilter(tr: Transaction): TransactionSpec | Transaction {
  if (!tr.docChanged || !tr.isUserEvent('delete')) return tr
  const dels: TextRange[] = []
  let inserts = false
  tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
    if (inserted.length > 0) inserts = true
    dels.push({ from: fromA, to: toA })
  })
  if (inserts) return tr
  const state = tr.startState
  const doc = state.doc.toString()
  const markup = collectMarkup(doc, codeHintsFromTree(state))
  if (markup.hidden.length === 0) return tr
  const dir = tr.isUserEvent('delete.backward')
    ? 'backward'
    : tr.isUserEvent('delete.forward')
      ? 'forward'
      : null
  const planned = mergeRanges(dels.flatMap((d) => planMarkerDeletion(doc, markup, d, dir)))
  const same =
    planned.length === dels.length &&
    planned.every((r, i) => r.from === dels[i].from && r.to === dels[i].to)
  if (same) return tr
  const changes = state.changes(planned)
  // A single Backspace leaves the caret where the character was (inside the
  // span, so typing continues its style); otherwise map the old selection.
  const single = state.selection.ranges.length === 1 && planned.length === 1
  const selection =
    single && dir === 'backward'
      ? EditorSelection.cursor(planned[0].from)
      : state.selection.map(changes, -1)
  return {
    changes,
    selection,
    userEvent: tr.annotation(Transaction.userEvent),
    scrollIntoView: tr.scrollIntoView,
  }
}

export function applyHighlight(view: FormatTarget, color: HighlightColor): void {
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

    formatDispatch(view, {
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

    formatDispatch(view, {
      changes: { from: effectiveFrom, to: effectiveTo, insert: `==${selected}=={.${color}}` },
      selection: { anchor: effectiveFrom + 2, head: effectiveFrom + 2 + selected.length },
    })
  }
}

export function removeHighlight(view: FormatTarget): void {
  const { from, to } = view.state.selection.main
  const doc = view.state.doc.toString()

  const highlights = findHighlights(doc)
  for (const h of highlights) {
    if (h.from <= from && h.to >= to) {
      formatDispatch(view, {
        changes: { from: h.from, to: h.to, insert: h.text },
        selection: { anchor: h.from, head: h.from + h.text.length },
      })
      return
    }
  }
}

/**
 * The toolbar's "remove all formatting": strips highlight, text color, font
 * size and inline markers from the selection as ONE undo step (running the four
 * removers against the view directly would record four).
 */
export function clearAllFormatting(view: FormatTarget): void {
  let state = view.state
  let changes = ChangeSet.empty(state.doc.length)
  const scratch: FormatTarget = {
    get state() {
      return state
    },
    dispatch(tr) {
      const next = tr instanceof Transaction ? tr : state.update(tr)
      changes = changes.compose(next.changes)
      state = next.state
    },
  }
  removeHighlight(scratch)
  removeTextColor(scratch)
  removeFontSizeInline(scratch)
  removeAllFormatting(scratch)
  if (changes.empty) return
  formatDispatch(view, { changes, selection: state.selection })
}
