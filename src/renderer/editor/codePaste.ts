import { isolateHistory } from '@codemirror/commands'
import { LanguageDescription, syntaxTree } from '@codemirror/language'
import { languages } from '@codemirror/language-data'
import type { EditorState, Extension, TransactionSpec } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import type { SyntaxNode } from '@lezer/common'
import { detectLanguage, normalizeCode } from './detectLanguage'
import { findFencedCode } from './highlight'

/**
 * Pasting code into a markdown note wraps it in a fenced block tagged with the
 * detected language (```ts …```), so it lands highlighted instead of being
 * mangled by the inline-marker renderer. Ctrl/Cmd+Shift+V always pastes plain.
 *
 * Only added for markdown notes (see `languageExtension`). Files/images are
 * left to `attachmentExtension`, which must come earlier in the extension list.
 */

/** VS Code language ids → fence ids; null = "this is prose, never wrap". */
const VSCODE_MODES: Record<string, string | null> = {
  javascript: 'javascript',
  javascriptreact: 'jsx',
  typescript: 'typescript',
  typescriptreact: 'tsx',
  json: 'json',
  jsonc: 'json',
  shellscript: 'bash',
  csharp: 'csharp',
  cpp: 'cpp',
  plaintext: null,
  markdown: null,
}

/** Resolves a VS Code `mode` to a fence id the markdown highlighter knows, or null. */
export function fenceLanguageFromVsCode(raw: string | undefined): string | null | undefined {
  if (!raw) return undefined
  let mode: unknown
  try {
    mode = (JSON.parse(raw) as { mode?: unknown }).mode
  } catch {
    return undefined
  }
  if (typeof mode !== 'string' || mode === '') return undefined
  const mapped = mode in VSCODE_MODES ? VSCODE_MODES[mode] : mode
  if (mapped === null) return null
  return LanguageDescription.matchLanguageName(languages, mapped, false) ? mapped : undefined
}

/** Removes the indentation shared by every non-blank line. */
export function dedent(text: string): string {
  const lines = text.split('\n')
  let common: string | null = null
  for (const line of lines) {
    if (line.trim() === '') continue
    const indent = /^[ \t]*/.exec(line)?.[0] ?? ''
    if (common === null) {
      common = indent
    } else {
      let i = 0
      while (i < common.length && i < indent.length && common[i] === indent[i]) i++
      common = common.slice(0, i)
    }
    if (common === '') return text
  }
  if (!common) return text
  const n = common.length
  return lines.map((line) => (line.trim() === '' ? '' : line.slice(n))).join('\n')
}

const CODE_NODES = new Set(['FencedCode', 'CodeBlock', 'InlineCode'])

/** True when `pos` is inside a fenced/indented code block or inline code. */
export function isInCode(state: EditorState, pos: number): boolean {
  for (
    let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, -1);
    node;
    node = node.parent
  ) {
    if (CODE_NODES.has(node.name) && node.from < pos && pos < node.to) return true
  }
  // The parser may not have reached `pos` yet in a long note; a fence scan
  // is always complete.
  return findFencedCode(state.doc.toString()).some((r) => r.from < pos && pos < r.to)
}

/**
 * The transaction for pasting `text` as a fenced code block at the main
 * selection, or null to let the normal paste happen.
 */
export function buildCodePaste(
  state: EditorState,
  text: string,
  vscodeData?: string,
): TransactionSpec | null {
  if (state.readOnly || state.selection.ranges.length > 1) return null
  const { from, to } = state.selection.main
  if (isInCode(state, from) || isInCode(state, to)) return null

  const code = dedent(normalizeCode(text))
  if (code.trim() === '') return null
  const isShortSingleLine = !code.includes('\n') && code.trim().length < 40

  const fromVsCode = fenceLanguageFromVsCode(vscodeData)
  let language: string
  if (fromVsCode === null) return null
  if (fromVsCode !== undefined) {
    if (isShortSingleLine) return null
    language = fromVsCode
  } else {
    const detected = detectLanguage(code)
    if (detected === null) return null
    language = detected.language
  }

  let longestRun = 0
  for (const run of code.match(/`+/g) ?? []) longestRun = Math.max(longestRun, run.length)
  const fence = '`'.repeat(Math.max(3, longestRun + 1))

  const before = state.sliceDoc(state.doc.lineAt(from).from, from)
  const prefix = before.trim() === '' ? '' : '\n'
  const insert = `${prefix}${fence}${language}\n${code}\n${fence}\n`

  return {
    changes: { from, to, insert },
    selection: { anchor: from + insert.length },
    userEvent: 'input.paste',
    annotations: isolateHistory.of('full'),
    scrollIntoView: true,
  }
}

/** Mirrors attachmentExtension's check: any non-empty file means it's not ours. */
function clipboardHasFiles(data: DataTransfer): boolean {
  for (const file of Array.from(data.files)) if (file.size > 0) return true
  return Array.from(data.items).some((item) => item.kind === 'file')
}

function isPlainPasteKey(event: KeyboardEvent): boolean {
  return (
    (event.ctrlKey || event.metaKey) &&
    event.shiftKey &&
    (event.code === 'KeyV' || event.key.toLowerCase() === 'v')
  )
}

export function codePasteExtension(): Extension {
  // The paste event can't tell Ctrl+Shift+V ("paste as plain text") from a
  // normal paste, so remember the shortcut from its keydown.
  let plainPasteUntil = 0
  return EditorView.domEventHandlers({
    keydown(event) {
      if (isPlainPasteKey(event)) plainPasteUntil = Date.now() + 1000
      return false
    },
    paste(event, view) {
      if (Date.now() < plainPasteUntil) {
        plainPasteUntil = 0
        return false
      }
      const data = event.clipboardData
      if (!data || clipboardHasFiles(data)) return false
      const text = data.getData('text/plain')
      if (!text) return false
      const spec = buildCodePaste(view.state, text, data.getData('vscode-editor-data'))
      if (spec === null) return false
      event.preventDefault()
      view.dispatch(spec)
      return true
    },
  })
}
