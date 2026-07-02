import type { ImportedNote } from './types'

/**
 * Plain-text import: the content is kept verbatim; only the extension changes
 * to `.md` so the note gets markdown editing affordances in Slate.
 */
export function txtToNote(fileName: string, content: string): ImportedNote {
  const base = fileName.replace(/\.txt$/i, '')
  return { name: `${base}.md`, content }
}
