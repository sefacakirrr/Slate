import { EditorView } from '@codemirror/view'
import { api } from '@renderer/api'
import { t } from '@renderer/i18n'
import { isOpenableFileName } from '@renderer/stores/externalPath'
import { useNoticeStore } from '@renderer/stores/noticeStore'

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif'])

function isImageFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true
  const dot = file.name.lastIndexOf('.')
  if (dot === -1) return false
  return IMAGE_EXTS.has(file.name.slice(dot + 1).toLowerCase())
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function generatePasteName(file: File): string {
  if (file.name && file.name !== 'image.png') return file.name
  const ext = file.type.split('/')[1] || 'png'
  return `paste-${Date.now()}.${ext}`
}

async function handleFiles(view: EditorView, files: FileList | File[]): Promise<boolean> {
  const fileArray = Array.from(files)
  if (fileArray.length === 0) return false

  const MAX_SIZE = 10 * 1024 * 1024

  const links: string[] = []

  const failures: string[] = []

  for (const file of fileArray) {
    if (file.size > MAX_SIZE) {
      failures.push(
        t('editor.attachments.tooLarge', { name: file.name || t('editor.attachments.pastedFile') }),
      )
      continue
    }

    const buffer = await file.arrayBuffer()
    const base64 = arrayBufferToBase64(buffer)
    const name = generatePasteName(file)

    const result = await api.attachment.store({ data: base64, name })
    if (!result.ok) {
      console.warn(`Attachment store failed: ${result.error}`)
      failures.push(t('editor.attachments.attachFailed', { name }))
      continue
    }

    const { relativePath } = result.data
    if (isImageFile(file)) {
      links.push(`![${name}](${relativePath})`)
    } else {
      links.push(`[${name}](${relativePath})`)
    }
  }

  if (failures.length > 0) {
    useNoticeStore.getState().notify(failures.join(' '))
  }

  if (links.length === 0) return false

  requestAnimationFrame(() => {
    const cursor = view.state.selection.main.head
    const doc = view.state.doc
    const line = doc.lineAt(cursor)

    // Ensure attachment goes on its own line
    let prefix = ''
    let suffix = ''
    if (line.text.trim().length > 0 && cursor === line.to) {
      prefix = '\n'
    } else if (line.text.trim().length > 0 && cursor === line.from) {
      suffix = '\n'
    } else if (line.text.trim().length > 0) {
      prefix = '\n'
      suffix = '\n'
    }

    const insertion = prefix + links.join('\n') + suffix
    view.dispatch({
      changes: { from: cursor, insert: insertion },
      selection: { anchor: cursor + insertion.length },
    })
  })

  return true
}

function extractFilesFromClipboard(clipboardData: DataTransfer | null): File[] {
  if (!clipboardData) return []

  // Try .files first (works for drag-drop and some paste scenarios)
  if (clipboardData.files.length > 0) {
    return Array.from(clipboardData.files).filter((f) => f.size > 0)
  }

  // Fall back to .items (Windows screenshot paste puts images here)
  const files: File[] = []
  for (let i = 0; i < clipboardData.items.length; i++) {
    const item = clipboardData.items[i]
    if (item.kind === 'file') {
      const file = item.getAsFile()
      if (file && file.size > 0) files.push(file)
    }
  }
  return files
}

/**
 * File paste/drop → vault attachment links. `attach: false` (external tabs:
 * a vault-relative link is meaningless in a file outside the vault) keeps
 * swallowing file drops but stores nothing.
 *
 * Dropped `.md`/`.markdown`/`.txt` files are never attached: the window-level
 * drop handler (App) opens them as tabs. Every file drop is claimed here so
 * CodeMirror never inlines a dropped file's text.
 */
export function attachmentExtension(opts: { attach?: boolean } = {}) {
  const attach = opts.attach !== false
  return EditorView.domEventHandlers({
    paste(event, view) {
      if (!attach) return false
      const files = extractFilesFromClipboard(event.clipboardData)
      if (files.length === 0) return false

      event.preventDefault()
      void handleFiles(view, files)
      return true
    },
    drop(event, view) {
      const files = event.dataTransfer?.files
      if (!files || files.length === 0) return false

      event.preventDefault()
      const toAttach = Array.from(files).filter((f) => !isOpenableFileName(f.name))
      if (attach && toAttach.length > 0) void handleFiles(view, toAttach)
      return true
    },
  })
}
