import type { ImportedNote } from './types'

/**
 * Markdown import: already Slate's native format — name and content pass
 * through unchanged. Exists as an importer so the engine treats every source
 * uniformly (and so future normalization has a home).
 */
export function mdToNote(fileName: string, content: string): ImportedNote {
  return { name: fileName, content }
}
