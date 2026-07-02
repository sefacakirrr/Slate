import { createHash } from 'node:crypto'
import AdmZip from 'adm-zip'
import type { ConversionResult, ImportedNote } from './types'

/**
 * Notion export id suffix: the final path segment of every exported file and
 * folder carries a 32-hex-char id (`My Note 0123abcd...ef.md`). Stripped for
 * readable vault filenames.
 */
const NOTION_ID_RE = / [0-9a-f]{32}(?=(\.[a-z0-9]+)?$)/i

function stripNotionId(segment: string): string {
  return segment.replace(NOTION_ID_RE, '')
}

const ATTACHMENT_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'svg',
  'bmp',
  'avif',
  'pdf',
  'mp3',
  'mp4',
  'mov',
  'wav',
  'zip',
  'docx',
  'xlsx',
  'pptx',
])

function extensionOf(path: string): string {
  const dot = path.lastIndexOf('.')
  return dot === -1 ? '' : path.slice(dot + 1).toLowerCase()
}

/**
 * Notion zip import: extracts `.md` notes (flattened — Notion nests one
 * folder per page) and their referenced assets. Assets are stored hash-named
 * under `_attachments/` (same convention as AttachmentService) and links in
 * note content are rewritten from Notion's URL-encoded relative paths to the
 * new attachment paths. CSV database exports are skipped (non-goal).
 */
export function notionZipToNotes(zipData: Buffer): ConversionResult {
  const zip = new AdmZip(zipData)
  const entries = zip.getEntries().filter((e) => !e.isDirectory)

  // Pass 1: collect assets, build old-path → new-path mapping for link rewriting.
  const attachments: ConversionResult['attachments'] = []
  const pathMap = new Map<string, string>()
  for (const entry of entries) {
    const ext = extensionOf(entry.entryName)
    if (!ATTACHMENT_EXTENSIONS.has(ext)) continue
    const data = entry.getData()
    const hash = createHash('sha256').update(data).digest('hex')
    const newPath = `_attachments/${hash}.${ext}`
    pathMap.set(entry.entryName.replace(/\\/g, '/'), newPath)
    if (!attachments.some((a) => a.path === newPath)) {
      attachments.push({ path: newPath, data })
    }
  }

  // Pass 2: convert notes, rewriting asset links.
  const notes: ImportedNote[] = []
  const usedNames = new Set<string>()
  for (const entry of entries) {
    if (extensionOf(entry.entryName) !== 'md') continue
    const entryPath = entry.entryName.replace(/\\/g, '/')
    let content = entry.getData().toString('utf-8')
    content = rewriteAssetLinks(content, entryPath, pathMap)

    const base = stripNotionId(entryPath.split('/').pop() ?? entryPath).replace(/\.md$/i, '')
    let name = `${base}.md`
    // Flattening can collide (same page title in different branches): -1, -2…
    for (let i = 1; usedNames.has(name.toLowerCase()); i++) {
      name = `${base}-${i}.md`
    }
    usedNames.add(name.toLowerCase())
    notes.push({ name, content })
  }

  return { notes, attachments }
}

/**
 * Rewrites markdown links/images whose targets are files inside the zip.
 * Notion links are URL-encoded and relative to the note's own directory.
 */
function rewriteAssetLinks(
  content: string,
  notePath: string,
  pathMap: Map<string, string>,
): string {
  const noteDir = notePath.includes('/') ? notePath.slice(0, notePath.lastIndexOf('/') + 1) : ''
  return content.replace(/(!?\[[^\]]*\]\()([^)]+)(\))/g, (whole, open, target, close) => {
    if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return whole // external URL — untouched
    let decoded: string
    try {
      decoded = decodeURIComponent(target)
    } catch {
      return whole
    }
    const resolved = decoded.startsWith('/') ? decoded.slice(1) : noteDir + decoded
    const mapped = pathMap.get(resolved)
    return mapped === undefined ? whole : `${open}${mapped}${close}`
  })
}
