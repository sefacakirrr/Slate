import { history, redo, undo, undoDepth } from '@codemirror/commands'
import {
  EditorSelection,
  EditorState,
  type Transaction,
  type TransactionSpec,
} from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import {
  applyFontSizeInline,
  applyTextColor,
  type FormatTarget,
  findFontSizes,
  setAlignment,
  toggleChecklist,
  toggleFormat,
} from './formatting'
import { applyHighlight, clearAllFormatting } from './highlight'

/** A minimal `{ state, dispatch }` editor with history, like a real view. */
function makeEditor(doc: string, anchor: number, head = anchor) {
  let state = EditorState.create({
    doc,
    selection: EditorSelection.single(anchor, head),
    extensions: [history()],
  })
  const target: FormatTarget & { state: EditorState } = {
    get state() {
      return state
    },
    dispatch(tr: Transaction | TransactionSpec) {
      state = 'startState' in tr ? tr.state : state.update(tr).state
    },
  }
  // Simulates typing: an input.type transaction, like CM's DOM observer emits.
  const type = (text: string) => {
    const pos = state.selection.main.head
    target.dispatch(
      state.update({
        changes: { from: pos, insert: text },
        selection: { anchor: pos + text.length },
        userEvent: 'input.type',
      }),
    )
  }
  return { target, type }
}

describe('formatting history', () => {
  it('toggleFormat then one undo restores the exact original doc', () => {
    const { target } = makeEditor('hello world', 6, 11)
    toggleFormat(target, 'bold')
    expect(target.state.doc.toString()).toBe('hello **world**')
    expect(undo(target)).toBe(true)
    expect(target.state.doc.toString()).toBe('hello world')
    expect(target.state.selection.main.from).toBe(6)
    expect(target.state.selection.main.to).toBe(11)
    expect(redo(target)).toBe(true)
    expect(target.state.doc.toString()).toBe('hello **world**')
  })

  it('records each consecutive format op as its own undo step', () => {
    const { target } = makeEditor('hello world', 6, 11)
    toggleFormat(target, 'bold')
    toggleFormat(target, 'italic')
    applyTextColor(target, 'red')
    expect(undoDepth(target.state)).toBe(3)
    undo(target)
    undo(target)
    expect(target.state.doc.toString()).toBe('hello **world**')
    undo(target)
    expect(target.state.doc.toString()).toBe('hello world')
  })

  it('does not merge a format op with adjacent typing', () => {
    const { target, type } = makeEditor('', 0)
    type('a')
    type('b')
    target.dispatch({ selection: { anchor: 0, head: 2 } })
    toggleFormat(target, 'underline')
    target.dispatch({ selection: { anchor: target.state.doc.length } })
    type('c')
    expect(target.state.doc.toString()).toBe('++ab++c')
    undo(target)
    expect(target.state.doc.toString()).toBe('++ab++')
    undo(target)
    expect(target.state.doc.toString()).toBe('ab')
  })

  it.each([
    ['highlight', (t: FormatTarget) => applyHighlight(t, 'yellow')],
    ['text color', (t: FormatTarget) => applyTextColor(t, 'blue')],
    ['font size', (t: FormatTarget) => applyFontSizeInline(t, 20)],
    ['alignment', (t: FormatTarget) => setAlignment(t, 'center')],
    ['checklist', (t: FormatTarget) => toggleChecklist(t)],
    ['code', (t: FormatTarget) => toggleFormat(t, 'code')],
  ])('%s is undone in exactly one step', (_name, op) => {
    const original = 'line one\nsome text here'
    const { target } = makeEditor(original, 9, 18)
    op(target)
    expect(target.state.doc.toString()).not.toBe(original)
    expect(undoDepth(target.state)).toBe(1)
    undo(target)
    expect(target.state.doc.toString()).toBe(original)
  })

  it('clearAllFormatting is a single undo step', () => {
    const original = '==a {color:red}b{/color} {size:20}c{/size} **d**=={.yellow}'
    const { target } = makeEditor(original, 0, original.length)
    clearAllFormatting(target)
    expect(target.state.doc.toString()).toBe('a b c d')
    expect(undoDepth(target.state)).toBe(1)
    undo(target)
    expect(target.state.doc.toString()).toBe(original)
  })
})

describe('toggleFormat multi-line', () => {
  it('wraps each non-empty line separately', () => {
    const { target } = makeEditor('one\n\n  two  ', 0, 12)
    toggleFormat(target, 'bold')
    expect(target.state.doc.toString()).toBe('**one**\n\n  **two**  ')
  })
})

describe('findFontSizes', () => {
  it('pairs nested markers innermost first', () => {
    const doc = '{size:20}a{size:12}b{/size}c{/size}'
    expect(findFontSizes(doc).map((s) => [s.size, doc.slice(s.innerFrom, s.innerTo)])).toEqual([
      [20, 'a{size:12}b{/size}c'],
      [12, 'b'],
    ])
  })

  it('skips unmatched markers', () => {
    expect(findFontSizes('{/size}{size:10}x')).toEqual([])
  })
})

describe('toggleChecklist', () => {
  const run = (doc: string, from: number, to: number) => {
    const { target } = makeEditor(doc, from, to)
    toggleChecklist(target)
    return target.state.doc.toString()
  }

  it('skips blank lines in a multi-line selection, and toggles back off', () => {
    const doc = 'a\n\nb\n'
    const on = run(doc, 0, doc.length)
    expect(on).toBe('- [ ] a\n\n- [ ] b\n')
    expect(run(on, 0, on.length)).toBe('a\n\nb\n')
  })

  it('turns plain list items into tasks in place', () => {
    expect(run('- milk\n  * eggs', 0, 14)).toBe('- [ ] milk\n  * [ ] eggs')
  })

  it('still starts a task on a single empty line', () => {
    expect(run('', 0, 0)).toBe('- [ ] ')
  })
})
