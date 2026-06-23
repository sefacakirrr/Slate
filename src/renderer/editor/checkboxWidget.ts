import { RangeSetBuilder } from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  type EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view'

// Capture: leading indent, bullet + space, the [ ] state, and an optional
// trailing space. The whole `- [ ] ` run (minus leading indent) is replaced by
// the checkbox widget so no inline marker remains in the text flow.
const TASK_RE = /^(\s*)([-*+] )\[([ xX])\]( ?)/gm

type TaskMatch = {
  from: number
  to: number
  checkPos: number
  checked: boolean
  lineFrom: number
}

function findTasks(doc: string): TaskMatch[] {
  const results: TaskMatch[] = []
  let match: RegExpExecArray | null = TASK_RE.exec(doc)
  while (match !== null) {
    const fullStart = match.index
    const leadingWs = match[1]
    const bullet = match[2]
    const trailing = match[4]
    const bulletStart = fullStart + leadingWs.length
    // `- [ ] `: bullet(2) `[`(1) state(1) `]`(1) + optional space.
    const checkPos = bulletStart + bullet.length + 1
    const to = bulletStart + bullet.length + 3 + trailing.length
    results.push({
      from: bulletStart,
      to,
      checkPos,
      checked: match[3] !== ' ',
      lineFrom: fullStart,
    })
    match = TASK_RE.exec(doc)
  }
  TASK_RE.lastIndex = 0
  return results
}

class CheckboxWidget extends WidgetType {
  private readonly checked: boolean
  private readonly checkPos: number

  constructor(checked: boolean, checkPos: number) {
    super()
    this.checked = checked
    this.checkPos = checkPos
  }

  eq(other: CheckboxWidget): boolean {
    return this.checked === other.checked && this.checkPos === other.checkPos
  }

  toDOM(view: EditorView): HTMLElement {
    // Outer wrapper: pulled out of the text flow into the left gutter so the
    // editable text wraps cleanly to its right with a hanging indent. Its
    // height matches one line so the box vertically centres on the first row.
    const wrap = document.createElement('span')
    wrap.className = 'cm-checkbox-widget'
    wrap.style.position = 'absolute'
    wrap.style.left = '0'
    wrap.style.top = '0'
    wrap.style.height = `${view.defaultLineHeight}px`
    wrap.style.display = 'inline-flex'
    wrap.style.alignItems = 'center'
    wrap.style.justifyContent = 'center'
    wrap.style.width = '16px'
    wrap.style.cursor = 'pointer'
    wrap.contentEditable = 'false'

    const box = document.createElement('span')
    box.style.display = 'inline-flex'
    box.style.alignItems = 'center'
    box.style.justifyContent = 'center'
    box.style.width = '16px'
    box.style.height = '16px'
    box.style.borderRadius = '50%'
    box.style.border = this.checked ? 'none' : '2px solid #64748b'
    box.style.backgroundColor = this.checked ? '#8b5cf6' : 'transparent'
    box.style.flexShrink = '0'
    box.style.transition = 'background-color 150ms, border-color 150ms'
    wrap.appendChild(box)

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
      box.appendChild(svg)
    }

    const checkPos = this.checkPos
    const checked = this.checked
    wrap.addEventListener('mousedown', (e) => {
      e.preventDefault()
      e.stopPropagation()
      const newChar = checked ? ' ' : 'x'
      view.dispatch({
        changes: { from: checkPos, to: checkPos + 1, insert: newChar },
      })
    })

    return wrap
  }

  ignoreEvent(): boolean {
    return false
  }
}

// Line decorations give the task line its hanging-indent column (padding-left)
// and a positioning context for the absolutely placed checkbox.
const taskLineDeco = Decoration.line({ attributes: { class: 'cm-task-line' } })
const taskLineCheckedDeco = Decoration.line({
  attributes: { class: 'cm-task-line cm-task-checked' },
})

function buildDecorations(view: EditorView): DecorationSet {
  const doc = view.state.doc.toString()
  const tasks = findTasks(doc)
  const builder = new RangeSetBuilder<Decoration>()

  const sorted: { pos: number; end: number; deco: Decoration }[] = []

  for (const task of tasks) {
    if (task.to > view.state.doc.length) continue
    const widget = new CheckboxWidget(task.checked, task.checkPos)
    const line = view.state.doc.lineAt(task.from)
    sorted.push({
      pos: line.from,
      end: line.from,
      deco: task.checked ? taskLineCheckedDeco : taskLineDeco,
    })
    sorted.push({ pos: task.from, end: task.to, deco: Decoration.replace({ widget }) })
  }

  // Line decorations (end === pos) must precede the replace range at the same
  // offset; sorting by pos then end guarantees that.
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
