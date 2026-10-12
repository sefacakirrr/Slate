import { history, undo, undoDepth } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { EditorSelection, EditorState } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { buildCodePaste, dedent, fenceLanguageFromVsCode, isInCode } from './codePaste'

const PY = 'def add(a, b):\n    return a + b\n\nprint(add(1, 2))'

function md(doc: string, anchor: number, head = anchor) {
  return EditorState.create({
    doc,
    selection: EditorSelection.single(anchor, head),
    extensions: [markdown(), history()],
  })
}

function paste(state: EditorState, text: string, vscode?: string) {
  const spec = buildCodePaste(state, text, vscode)
  return spec === null ? null : state.update(spec).state
}

describe('buildCodePaste', () => {
  it('wraps detected code in a fenced block with the language', () => {
    const next = paste(md('', 0), PY)
    expect(next?.doc.toString()).toBe(`\`\`\`python\n${PY}\n\`\`\`\n`)
    expect(next?.selection.main.head).toBe(next?.doc.length)
  })

  it('starts the block on a new line when the cursor is mid-line', () => {
    const next = paste(md('intro text', 10), PY)
    expect(next?.doc.toString()).toBe(`intro text\n\`\`\`python\n${PY}\n\`\`\`\n`)
  })

  it('puts trailing text of the line after the block', () => {
    const next = paste(md('ab', 1), PY)
    expect(next?.doc.toString()).toBe(`a\n\`\`\`python\n${PY}\n\`\`\`\nb`)
    expect(next?.selection.main.head).toBe((next?.doc.length ?? 0) - 1)
  })

  it('is undone in a single step', () => {
    const start = md('note\n', 5)
    const next = paste(start, PY)
    expect(next).not.toBeNull()
    if (next === null) return
    expect(undoDepth(next)).toBe(1)
    let state = next
    undo({ state, dispatch: (tr) => (state = tr.state) })
    expect(state.doc.toString()).toBe('note\n')
  })

  it('normalizes CRLF and strips common indentation and blank edges', () => {
    const text = '\r\n    def f():\r\n        return 1\r\n\r\n    print(f())\r\n\r\n'
    const next = paste(md('', 0), text)
    expect(next?.doc.toString()).toBe('```python\ndef f():\n    return 1\n\nprint(f())\n```\n')
  })

  it('uses a longer fence when the code contains backticks', () => {
    const text = 'const s = `a`\nconst t = ```x```\nconsole.log(s, t)'
    const next = paste(md('', 0), text)
    expect(next?.doc.toString().startsWith('````javascript\n')).toBe(true)
  })

  it('does nothing inside a fenced code block', () => {
    const doc = '```\nhere\n```'
    expect(buildCodePaste(md(doc, 6), PY)).toBeNull()
  })

  it('does nothing inside inline code', () => {
    const doc = 'a `xy` b'
    expect(buildCodePaste(md(doc, 4), PY)).toBeNull()
  })

  it('does nothing for prose, markdown, or a short single line', () => {
    expect(buildCodePaste(md('', 0), 'Just a sentence I copied from somewhere.')).toBeNull()
    expect(buildCodePaste(md('', 0), '- one\n- two\n- three')).toBeNull()
    expect(buildCodePaste(md('', 0), '# Heading\n\nSome paragraph text here.')).toBeNull()
    expect(buildCodePaste(md('', 0), 'const x = 1')).toBeNull()
  })

  it('prefers the VS Code clipboard language', () => {
    const vscode = JSON.stringify({
      version: 1,
      isFromEmptySelection: false,
      mode: 'typescriptreact',
    })
    const next = paste(md('', 0), 'let a = 1\nlet b = 2', vscode)
    expect(next?.doc.toString()).toBe('```tsx\nlet a = 1\nlet b = 2\n```\n')
  })

  it('never wraps VS Code plaintext/markdown copies', () => {
    const vscode = JSON.stringify({ mode: 'markdown' })
    expect(buildCodePaste(md('', 0), PY, vscode)).toBeNull()
  })

  it('ignores a short single line even from VS Code', () => {
    const vscode = JSON.stringify({ mode: 'typescript' })
    expect(buildCodePaste(md('', 0), 'foo()', vscode)).toBeNull()
  })
})

describe('fenceLanguageFromVsCode', () => {
  it('maps and validates modes', () => {
    expect(fenceLanguageFromVsCode(JSON.stringify({ mode: 'python' }))).toBe('python')
    expect(fenceLanguageFromVsCode(JSON.stringify({ mode: 'shellscript' }))).toBe('bash')
    expect(fenceLanguageFromVsCode(JSON.stringify({ mode: 'plaintext' }))).toBeNull()
    expect(fenceLanguageFromVsCode(JSON.stringify({ mode: 'not-a-language' }))).toBeUndefined()
    expect(fenceLanguageFromVsCode('not json')).toBeUndefined()
    expect(fenceLanguageFromVsCode(undefined)).toBeUndefined()
  })
})

describe('dedent', () => {
  it('removes shared indentation only', () => {
    expect(dedent('  a\n    b\n\n  c')).toBe('a\n  b\n\nc')
    expect(dedent('a\n  b')).toBe('a\n  b')
  })
})

describe('isInCode', () => {
  it('detects positions inside fences and inline code', () => {
    const doc = 'x `y` z\n```\ncode\n```\nend'
    const state = md(doc, 0)
    expect(isInCode(state, 3)).toBe(true)
    expect(isInCode(state, 0)).toBe(false)
    expect(isInCode(state, doc.indexOf('code') + 1)).toBe(true)
    expect(isInCode(state, doc.indexOf('end') + 1)).toBe(false)
  })
})
