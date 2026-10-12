import { EditorSelection, EditorState } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { highlightExtension } from './highlight'

/** Applies a delete transaction the way CodeMirror's commands emit it. */
function del(doc: string, from: number, to: number, userEvent: string, cursor = to) {
  const state = EditorState.create({
    doc,
    selection: EditorSelection.cursor(cursor),
    extensions: [highlightExtension],
  })
  const next = state.update({ changes: { from, to }, userEvent }).state
  return { doc: next.doc.toString(), head: next.selection.main.head }
}

describe('marker-aware deletion', () => {
  const doc = 'alpha **bet** gamma'
  // closing ** is [11,13); CodeMirror deletes the atomic marker whole.

  it('Backspace right after a span deletes its last visible char, not the marker', () => {
    const r = del(doc, 11, 13, 'delete.backward', 13)
    expect(r.doc).toBe('alpha **be** gamma')
    expect(r.head).toBe(10)
  })

  it('Delete right before a span closer deletes the char after the marker', () => {
    expect(del(doc, 11, 13, 'delete.forward', 11).doc).toBe('alpha **bet**gamma')
  })

  it('Backspace after an opening marker deletes the char before it', () => {
    expect(del(doc, 6, 8, 'delete.backward', 8).doc).toBe('alpha**bet** gamma')
  })

  it('deleting the last visible char of a span removes the whole span', () => {
    expect(del('a **b** c', 4, 5, 'delete.backward', 5).doc).toBe('a  c')
  })

  it('deleting all visible text of nested spans removes all their markers', () => {
    expect(del('a **_x_** c', 5, 6, 'delete.selection').doc).toBe('a  c')
  })

  it('a range delete across a span edge keeps the surviving span markers', () => {
    // select "ta** ga" in "**beta** gamma"
    expect(del('**beta** gamma', 4, 11, 'delete.selection').doc).toBe('**be**mma')
  })

  it('cut of a span visible text leaves no orphan markers', () => {
    expect(del('x {color:red}red{/color} y', 13, 16, 'delete.cut').doc).toBe('x  y')
  })

  it('Backspace at the start of an aligned line still removes the alignment', () => {
    expect(del('a\n{align:center}b', 2, 16, 'delete.backward', 16).doc).toBe('a\nb')
  })

  it('leaves ordinary deletes and non-delete edits alone', () => {
    expect(del(doc, 0, 1, 'delete.backward', 1).doc).toBe('lpha **bet** gamma')
    expect(del(doc, 11, 13, 'input', 13).doc).toBe('alpha **bet gamma')
  })

  it('treats markers inside code as text', () => {
    expect(del('`**x**`', 5, 6, 'delete.backward', 6).doc).toBe('`**x*`')
  })
})
