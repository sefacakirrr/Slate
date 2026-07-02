import type { ImportedNote } from './types'

/**
 * Generic plain-text import (Epic 15 scope extension): code files, configs,
 * logs, extension-less notes (common with Sublime Text / scratch files).
 * Content is kept verbatim; `.md` is appended to the FULL original name so
 * the source type stays visible and siblings like `app.js` / `app.py` can't
 * collide after conversion (`app.js` → `app.js.md`, `TODO` → `TODO.md`).
 */
export function textFileToNote(fileName: string, content: string): ImportedNote {
  return { name: `${fileName}.md`, content }
}
