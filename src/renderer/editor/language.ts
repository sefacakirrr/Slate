import { markdown } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import type { Extension } from '@codemirror/state'

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
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase()
  if (ext === 'md' || ext === 'markdown') {
    return markdown({ codeLanguages: languages })
  }
  return []
}
