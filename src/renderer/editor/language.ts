import { markdown } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import type { Extension } from '@codemirror/state'

/** True for notes edited in markdown mode (`.md` / `.markdown`, any case). */
export function isMarkdownPath(path: string): boolean {
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase()
  return ext === 'md' || ext === 'markdown'
}

/**
 * Picks the CodeMirror language extension for a note by its file extension:
 * `.md`/`.markdown` open in markdown mode with fenced code blocks highlighted
 * per language (via `@codemirror/language-data`); everything else (`.txt`)
 * opens in plain mode — an empty extension.
 *
 * Unknown fenced-code languages degrade gracefully: `lang-markdown` simply
 * leaves an unrecognized fence as plain text, no error.
 */
export function languageExtension(path: string): Extension {
  if (isMarkdownPath(path)) {
    return markdown({ codeLanguages: languages })
  }
  return []
}
