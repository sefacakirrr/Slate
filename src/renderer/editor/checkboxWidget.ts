import { RangeSetBuilder } from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  type EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view'

const TASK_RE = /^(\s*)([-*+] )\[([ xX])\]( ?)/gm
const COMPLETED_TS_RE = / ✓ \d{2}\.\d{2}\.\d{4} \d{2}:\d{2}$/

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

function formatTimestamp(): string {
  const now = new Date()
  const dd = String(now.getDate()).padStart(2, '0')
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const yyyy = now.getFullYear()
  const hh = String(now.getHours()).padStart(2, '0')
  const min = String(now.getMinutes()).padStart(2, '0')
  return `${dd}.${mm}.${yyyy} ${hh}:${min}`
}

function getContiguousTaskBlock(
  doc: { lines: number; line: (n: number) => { text: string; from: number; to: number } },
  lineNumber: number,
): { startLine: number; endLine: number } {
  let startLine = lineNumber
  let endLine = lineNumber

  for (let n = lineNumber - 1; n >= 1; n--) {
    if (/^\s*[-*+] \[[ xX]\]/.test(doc.line(n).text)) startLine = n
    else break
  }
  for (let n = lineNumber + 1; n <= doc.lines; n++) {
    if (/^\s*[-*+] \[[ xX]\]/.test(doc.line(n).text)) endLine = n
    else break
  }
  return { startLine, endLine }
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
    wrap.addEventListener('mousedown', (e) => {
      e.preventDefault()
      e.stopPropagation()

      // Re-locate the line at click time using current doc state
      const doc = view.state.doc
      if (checkPos >= doc.length) return
      const line = doc.lineAt(checkPos)

      // Verify this line is still a task item
      const lineMatch = /^(\s*)([-*+] )\[([ xX])\]/.exec(line.text)
      if (!lineMatch) return
      const isChecked = lineMatch[3] !== ' '

      const { startLine, endLine } = getContiguousTaskBlock(doc, line.number)

      if (startLine === endLine) {
        if (!isChecked) {
          const toggled = `${line.text.replace(/\[ \]/, '[x]')} ✓ ${formatTimestamp()}`
          view.dispatch({ changes: { from: line.from, to: line.to, insert: toggled } })
        } else {
          const toggled = line.text.replace(/\[x\]/i, '[ ]').replace(COMPLETED_TS_RE, '')
          view.dispatch({ changes: { from: line.from, to: line.to, insert: toggled } })
        }
        return
      }

      // Build sorted result
      const allLines: string[] = []
      for (let n = startLine; n <= endLine; n++) {
        allLines.push(doc.line(n).text)
      }
      const currentIdx = line.number - startLine
      if (!isChecked) {
        allLines[currentIdx] = `${allLines[currentIdx].replace(/\[ \]/, '[x]')} ✓ ${formatTimestamp()}`
      } else {
        allLines[currentIdx] = allLines[currentIdx].replace(/\[x\]/i, '[ ]').replace(COMPLETED_TS_RE, '')
      }

      const uncheckedList: string[] = []
      const checkedList: string[] = []
      for (const l of allLines) {
        if (/^\s*[-*+] \[[ ]\]/.test(l)) uncheckedList.push(l)
        else checkedList.push(l)
      }
      const sorted = [...checkedList, ...uncheckedList]

      const blockFrom = doc.line(startLine).from
      const blockTo = doc.line(endLine).to
      view.dispatch({ changes: { from: blockFrom, to: blockTo, insert: sorted.join('\n') } })
    })

    return wrap
  }

  ignoreEvent(): boolean {
    return false
  }
}

const taskLineDeco = Decoration.line({ attributes: { class: 'cm-task-line' } })
const taskLineCheckedDeco = Decoration.line({
  attributes: { class: 'cm-task-line cm-task-checked' },
})
const timestampMark = Decoration.mark({ attributes: { class: 'cm-task-timestamp' } })

const TIMESTAMP_INLINE_RE = / ✓ \d{2}\.\d{2}\.\d{4} \d{2}:\d{2}$/

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

    if (task.checked) {
      const lineText = line.text
      const tsMatch = TIMESTAMP_INLINE_RE.exec(lineText)
      if (tsMatch) {
        const tsFrom = line.from + tsMatch.index
        const tsTo = line.from + tsMatch.index + tsMatch[0].length
        sorted.push({ pos: tsFrom, end: tsTo, deco: timestampMark })
      }
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
