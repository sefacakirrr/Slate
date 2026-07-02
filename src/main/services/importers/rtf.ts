import type { ImportedNote } from './types'

/**
 * Groups whose content is metadata, not document text (font tables, colors,
 * embedded images…). Skipped wholesale, including nested groups.
 */
const DESTINATION_RE =
  /^\\\*|^\\(fonttbl|colortbl|stylesheet|info|pict|object|generator|themedata|listtable|listoverridetable|rsidtbl|latentstyles|datastore|colorschememapping|xmlnstbl|header[lrf]?|footer[lrf]?)\b/

/**
 * Best-effort RTF → plain text (Epic 15): covers what TextEdit (macOS) and
 * WordPad (Windows) produce for simple notes. Formatting is intentionally
 * dropped — the goal is recovering the user's words, not the styling.
 */
export function rtfToText(rtf: string): string {
  let out = ''
  let i = 0
  let depth = 0
  /** Depth of the group being skipped, or -1 when not skipping. */
  let skipUntilDepth = -1

  while (i < rtf.length) {
    const ch = rtf[i]

    if (ch === '{') {
      depth++
      if (skipUntilDepth === -1 && DESTINATION_RE.test(rtf.slice(i + 1, i + 32))) {
        skipUntilDepth = depth
      }
      i++
      continue
    }
    if (ch === '}') {
      if (skipUntilDepth !== -1 && depth === skipUntilDepth) skipUntilDepth = -1
      depth--
      i++
      continue
    }
    if (skipUntilDepth !== -1) {
      i++
      continue
    }

    if (ch === '\\') {
      const next = rtf[i + 1]
      // \'hh — cp1252 byte (≈ latin1 for the common range, incl. Turkish ç/é…)
      if (next === "'") {
        const code = Number.parseInt(rtf.slice(i + 2, i + 4), 16)
        out += Number.isNaN(code) ? '' : String.fromCharCode(code)
        i += 4
        continue
      }
      // Escaped literals and the non-breaking space symbol.
      if (next === '\\' || next === '{' || next === '}') {
        out += next
        i += 2
        continue
      }
      if (next === '~') {
        out += ' '
        i += 2
        continue
      }
      const m = /^([a-z]+)(-?\d+)? ?/.exec(rtf.slice(i + 1, i + 32))
      if (m !== null) {
        const word = m[1]
        if (word === 'par' || word === 'line') out += '\n'
        else if (word === 'tab') out += '\t'
        else if (word === 'u' && m[2] !== undefined) {
          let code = Number.parseInt(m[2], 10)
          if (code < 0) code += 65536
          out += String.fromCharCode(code)
          i += 1 + m[0].length
          // \uN is followed by one fallback char for non-Unicode readers.
          if (rtf[i] === '?') i++
          continue
        }
        i += 1 + m[0].length
        continue
      }
      i += 2 // unknown control symbol — drop it
      continue
    }

    // Raw CR/LF inside RTF source are not document newlines (\par is).
    if (ch === '\r' || ch === '\n') {
      i++
      continue
    }

    out += ch
    i++
  }

  return out.replace(/\n{3,}/g, '\n\n').trim()
}

/** RTF import: TextEdit/WordPad notes become plain markdown-editable text. */
export function rtfToNote(fileName: string, rtf: string): ImportedNote {
  const base = fileName.replace(/\.rtf$/i, '')
  return { name: `${base}.md`, content: `${rtfToText(rtf)}\n` }
}
