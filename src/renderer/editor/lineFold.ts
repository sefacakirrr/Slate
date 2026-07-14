/**
 * Line collapse extension: lines longer than SINGLE_ROW_CHARS get a
 * chevron in a narrow gutter (between line numbers and content).
 * Clicking it truncates the line to one visual row with an ellipsis.
 * Clicking the ellipsis or the chevron again expands it back.
 *
 * Uses a dedicated gutter — never touches inline text layout.
 */
import { type Extension, RangeSetBuilder, StateEffect, StateField } from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  GutterMarker,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
  gutter,
} from '@codemirror/view'

const SINGLE_ROW_CHARS = 100

const toggleLine = StateEffect.define<number>()

const collapsedSet = StateField.define<Set<number>>({
  create: () => new Set(),
  update(set, tr) {
    let next = set
    for (const e of tr.effects) {
      if (e.is(toggleLine)) {
        next = new Set(next)
        if (next.has(e.value)) next.delete(e.value)
        else next.add(e.value)
      }
    }
    return next
  },
})

class ChevronMarker extends GutterMarker {
  constructor(private readonly collapsed: boolean) {
    super()
  }

  eq(other: ChevronMarker) {
    return this.collapsed === other.collapsed
  }

  toDOM() {
    const el = document.createElement('span')
    el.className = 'cm-linefold-chevron'
    el.textContent = this.collapsed ? '▸' : '▾'
    return el
  }
}

class EllipsisBadge extends WidgetType {
  eq() {
    return true
  }

  toDOM() {
    const span = document.createElement('span')
    span.className = 'cm-linefold-ellipsis'
    span.textContent = '…'
    return span
  }

  ignoreEvent() {
    return false
  }
}

const chevronGutter = gutter({
  class: 'cm-linefold-gutter',
  lineMarker(view, line) {
    const docLine = view.state.doc.lineAt(line.from)
    if (docLine.length <= SINGLE_ROW_CHARS) return null
    const collapsed = view.state.field(collapsedSet).has(docLine.number)
    return new ChevronMarker(collapsed)
  },
  lineMarkerChange(update) {
    return (
      update.docChanged ||
      update.geometryChanged ||
      update.state.field(collapsedSet) !== update.startState.field(collapsedSet)
    )
  },
  domEventHandlers: {
    mousedown(view, line) {
      const docLine = view.state.doc.lineAt(line.from)
      if (docLine.length <= SINGLE_ROW_CHARS) return false
      view.dispatch({ effects: toggleLine.of(docLine.number) })
      return true
    },
  },
})

function buildDecorations(view: EditorView): DecorationSet {
  const collapsed = view.state.field(collapsedSet)
  const builder = new RangeSetBuilder<Decoration>()

  for (const lineNum of [...collapsed].sort((a, b) => a - b)) {
    if (lineNum > view.state.doc.lines) continue
    const line = view.state.doc.line(lineNum)
    if (line.length <= SINGLE_ROW_CHARS) continue
    const cutoff = line.from + SINGLE_ROW_CHARS
    builder.add(cutoff, line.to, Decoration.replace({ widget: new EllipsisBadge() }))
  }

  return builder.finish()
}

const truncPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view)
    }
    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.state.field(collapsedSet) !== update.startState.field(collapsedSet)
      ) {
        this.decorations = buildDecorations(update.view)
      }
    }
  },
  { decorations: (v) => v.decorations },
)

const clickExpand = EditorView.domEventHandlers({
  mousedown(event, view) {
    const target = event.target as HTMLElement
    if (!target.classList.contains('cm-linefold-ellipsis')) return false
    event.preventDefault()
    const pos = view.posAtDOM(target)
    const line = view.state.doc.lineAt(pos)
    view.dispatch({ effects: toggleLine.of(line.number) })
    return true
  },
})

const styles = EditorView.baseTheme({
  '.cm-linefold-gutter': {
    width: '14px',
    cursor: 'pointer',
  },
  '.cm-linefold-gutter .cm-gutterElement': {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0',
  },
  '.cm-linefold-chevron': {
    fontSize: '10px',
    color: '#64748b',
    transition: 'color 0.15s',
    '&:hover': {
      color: '#a78bfa',
    },
  },
  '.cm-linefold-ellipsis': {
    cursor: 'pointer',
    userSelect: 'none',
    display: 'inline-block',
    fontSize: '11px',
    fontWeight: 'bold',
    color: '#a78bfa',
    backgroundColor: '#8b5cf620',
    padding: '0 5px',
    marginLeft: '4px',
    borderRadius: '3px',
    verticalAlign: 'baseline',
    '&:hover': {
      backgroundColor: '#8b5cf635',
    },
  },
})

export function lineFoldExtension(): Extension {
  return [collapsedSet, chevronGutter, truncPlugin, clickExpand, styles]
}
