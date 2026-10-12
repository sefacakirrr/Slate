/**
 * A successful vault path change: one note moved (`file`, also lock/unlock where
 * the path gains/loses `.enc`), or a folder moved (`folder`) — every note under
 * `from/` now lives under `to/`.
 */
export type PathChange = { kind: 'file' | 'folder'; from: string; to: string }

/** Maps an old vault-relative path to its new one; `null` when unaffected. */
export type PathMapper = (path: string) => string | null

/**
 * Builds the mapper for one path change. Matching is case-insensitive when
 * `caseInsensitive` is set (Windows/macOS file systems: `Notes/a.md` and
 * `notes/a.md` are the same file), so a record stored with different casing
 * still follows the move. Folder matches are by whole segment: renaming `a`
 * never touches `ab/x.md`.
 */
export function createPathMapper(change: PathChange, caseInsensitive: boolean): PathMapper {
  const norm = (p: string) => (caseInsensitive ? p.toLowerCase() : p)
  if (change.kind === 'file') {
    const from = norm(change.from)
    return (path) => (norm(path) === from ? change.to : null)
  }
  const fromPrefix = norm(`${change.from}/`)
  const toPrefix = `${change.to}/`
  return (path) =>
    norm(path).startsWith(fromPrefix) ? toPrefix + path.slice(fromPrefix.length) : null
}

/** Case-insensitive file systems by default: Windows and macOS. */
export const PLATFORM_CASE_INSENSITIVE =
  process.platform === 'win32' || process.platform === 'darwin'
