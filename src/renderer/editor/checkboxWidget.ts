import { RangeSetBuilder } from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  type EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view'

const TASK_RE = /^(\s*[-*+]\s)\[([ xX])\]/gm

type TaskMatch = {
  from: number
  to: number
  checked: boolean
  lineFrom: number
}

function findTasks(doc: string): TaskMatch[] {
  const results: TaskMatch[] = []
  let match: RegExpExecArray | null = TASK_RE.exec(doc)
  while (match !== null) {
    const fullStart = match.index
    const prefix = match[1]
    const bracketStart = fullStart + prefix.length
    const bracketEnd = bracketStart + 3
    results.push({
      from: bracketStart,
      to: bracketEnd,
      checked: match[2] !== ' ',
      lineFrom: fullStart,
    })
    match = TASK_RE.exec(doc)
  }
  TASK_RE.lastIndex = 0
  return results
}

class CheckboxWidget extends WidgetType {
  private readonly checked: boolean
  private readonly pos: number

  constructor(checked: boolean, pos: number) {
    super()
    this.checked = checked
    this.pos = pos
  }

  eq(other: CheckboxWidget): boolean {
    return this.checked === other.checked && this.pos === other.pos
  }

  toDOM(view: EditorView): HTMLElement {
    const span = document.createElement('span')
    span.className = 'cm-checkbox-widget'
    span.style.display = 'inline-flex'
    span.style.alignItems = 'center'
    span.style.justifyContent = 'center'
    span.style.width = '16px'
    span.style.height = '16px'
    span.style.borderRadius = '50%'
    span.style.border = this.checked ? 'none' : '2px solid #64748b'
    span.style.backgroundColor = this.checked ? '#8b5cf6' : 'transparent'
    span.style.cursor = 'pointer'
    span.style.verticalAlign = 'middle'
    span.style.marginRight = '4px'
    span.style.flexShrink = '0'
    span.style.transition = 'background-color 150ms, border-color 150ms'
    span.contentEditable = 'false'

    if (this.checked) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      svg.setAttribute('width', '10')
      svg.setAttribute('height', '10')
      svg.setAttribute('viewBox', '0 0 24 24')
      svg.setAttribute('fill', 'none')
      svg.setAttribute('stroke', 'white')
      svg.setAttribute('stroke-width', '3')
      svg.setAttribute('stroke-linecap', 'round')
      svg.setAttribute('stroke-linejoin', 'round')
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      path.setAttribute('d', 'M20 6L9 17l-5-5')
      svg.appendChild(path)
      span.appendChild(svg)
    }

    const pos = this.pos
    const checked = this.checked
    span.addEventListener('mousedown', (e) => {
      e.preventDefault()
      e.stopPropagation()
      const newChar = checked ? ' ' : 'x'
      view.dispatch({
        changes: { from: pos + 1, to: pos + 2, insert: newChar },
      })
    })

    return span
  }

  ignoreEvent(): boolean {
    return false
  }
}

const checkedLineDeco = Decoration.line({
  attributes: {
    style: 'opacity: 0.5; text-decoration: line-through; text-decoration-color: #64748b;',
  },
})

function buildDecorations(view: EditorView): DecorationSet {
  const doc = view.state.doc.toString()
  const tasks = findTasks(doc)
  const builder = new RangeSetBuilder<Decoration>()

  const sorted: { pos: number; end: number; deco: Decoration }[] = []

  for (const task of tasks) {
    if (task.to > view.state.doc.length) continue
    const widget = new CheckboxWidget(task.checked, task.from)
    sorted.push({ pos: task.from, end: task.to, deco: Decoration.replace({ widget }) })
    if (task.checked) {
      const line = view.state.doc.lineAt(task.from)
      sorted.push({ pos: line.from, end: line.from, deco: checkedLineDeco })
    }
  }

  sorted.sort((a, b) => a.pos - b.pos || a.end - b.end)
  for (const s of sorted) {
    builder.add(s.pos, s.end, s.deco)
  }

  return builder.finish()
}

const checkboxPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view)
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet) {
        this.decorations = buildDecorations(update.view)
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  },
)

export function checkboxWidgetExtension() {
  return checkboxPlugin
}
