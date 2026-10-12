/**
 * Tab-path helpers for external (outside-vault) files. A vault tab is keyed by
 * its vault-relative path (`notes/a.md`); an external tab by its absolute path
 * (`C:\Users\me\a.md`, `/Users/me/a.md`, `\\server\share\a.md`). A
 * vault-relative path is never absolute, so the two never collide.
 */

/** Extensions Slate opens from the file manager (mirrors main's list). */
const OPENABLE_EXTENSIONS = ['.md', '.markdown', '.txt']

/** True when a tab path is an absolute path, i.e. an external file tab. */
export function isExternalTabPath(path: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(path) || path.startsWith('/') || path.startsWith('\\\\')
}

/** True for `.md` / `.markdown` / `.txt` names (any case). */
export function isOpenableFileName(name: string): boolean {
  const lower = name.toLowerCase()
  return OPENABLE_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

/** Last path segment, for either separator. */
export function baseName(path: string): string {
  const parts = path.split(/[\\/]/)
  return parts[parts.length - 1] || path
}
