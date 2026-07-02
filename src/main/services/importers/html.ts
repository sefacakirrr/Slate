import TurndownService from 'turndown'
import type { ImportedNote } from './types'

/**
 * One shared Turndown instance (stateless conversion). Config per the epic
 * plan: strip scripts/styles/head noise, keep headings, lists, bold/italic,
 * links and images; ATX headings and fenced code to match Slate's editor.
 */
const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
  emDelimiter: '_',
})
turndown.remove(['script', 'style', 'title', 'meta', 'link'])

/**
 * HTML import (Apple Notes export path). Converts one HTML document to a
 * markdown note. The note title (first line) comes from the document's
 * content itself — Apple Notes puts the note title as the first element.
 */
export function htmlToNote(fileName: string, html: string): ImportedNote {
  const base = fileName.replace(/\.html?$/i, '')
  const markdown = turndown.turndown(html).trim()
  return { name: `${base}.md`, content: `${markdown}\n` }
}
