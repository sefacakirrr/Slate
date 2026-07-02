import type { UpdateState } from '@shared/types'
import { app, shell } from 'electron'
import { autoUpdater } from 'electron-updater'

const GITHUB_OWNER = 'sefacakirrr'
const GITHUB_REPO = 'Slate'
const RELEASES_API = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`

/**
 * True if version `a` is strictly greater than `b` (major.minor.patch). Tolerates
 * a leading `v` and non-numeric junk. Pure — the one unit-testable piece.
 */
export function semverGt(a: string, b: string): boolean {
  const parse = (v: string): [number, number, number] => {
    const parts = v
      .trim()
      .replace(/^v/i, '')
      .split('.')
      .map((n) => Number.parseInt(n, 10) || 0)
    return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0]
  }
  const [a1, a2, a3] = parse(a)
  const [b1, b2, b3] = parse(b)
  if (a1 !== b1) return a1 > b1
  if (a2 !== b2) return a2 > b2
  return a3 > b3
}

/** Release-notes summary limits: keep the settings panel compact. */
const NOTES_MAX_LINES = 8
const NOTES_MAX_CHARS = 600

/**
 * Normalizes raw release notes (GitHub markdown body, or electron-updater's
 * HTML string / per-version array) into a short plain-text summary for the
 * settings panel. Pure — unit-testable.
 */
export function summarizeReleaseNotes(
  raw: string | { version: string; note: string | null }[] | null | undefined,
): string | undefined {
  const text = Array.isArray(raw)
    ? raw.map((r) => (r.note === null ? '' : `${r.version}: ${r.note}`)).join('\n')
    : (raw ?? '')

  const plain = text
    // HTML from electron-updater's GitHub provider → text.
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|ul|ol|h[1-6]|div)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // Markdown noise from a GitHub release body → readable text.
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .replace(/\r/g, '')

  const lines = plain
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
  if (lines.length === 0) return undefined

  let summary = lines.slice(0, NOTES_MAX_LINES).join('\n')
  if (summary.length > NOTES_MAX_CHARS) summary = `${summary.slice(0, NOTES_MAX_CHARS - 1)}…`
  else if (lines.length > NOTES_MAX_LINES) summary += '\n…'
  return summary
}

/**
 * Drives in-app updates (Epic 12) with a hard platform split:
 * - Windows: `electron-updater` checks + downloads + installs.
 * - macOS: a signing-independent GitHub Releases version check that, when a newer
 *   release exists, hands the renderer a URL to open (unsigned mac can't self-install).
 *
 * Every outcome is pushed to the renderer through the injected `emit` as a single
 * `UpdateState` stream, so the UI has one subscription. Real checks run only in a
 * packaged app; in dev `check()` emits `dev-disabled`.
 */
export class UpdateService {
  private readonly emit: (state: UpdateState) => void
  private readonly isMac = process.platform === 'darwin'
  private winWired = false
  /** Notes from the last `available` event, re-attached to progress emits so
   *  the "What's new" summary stays visible while the download runs. */
  private lastNotes: string | undefined

  constructor(emit: (state: UpdateState) => void) {
    this.emit = emit
  }

  check(): void {
    if (!app.isPackaged) {
      this.emit({ status: 'dev-disabled' })
      return
    }
    this.emit({ status: 'checking' })
    if (this.isMac) {
      void this.checkMac()
    } else {
      this.checkWindows()
    }
  }

  /** Windows: install the downloaded update and relaunch. */
  install(): void {
    autoUpdater.quitAndInstall()
  }

  /** macOS: open the GitHub Releases page (or any provided URL) in the browser. */
  async openReleases(url?: string): Promise<void> {
    await shell.openExternal(
      url ?? `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
    )
  }

  /** Windows path: electron-updater checks, auto-downloads, and reports progress. */
  private checkWindows(): void {
    if (!this.winWired) {
      autoUpdater.on('update-available', (info) => {
        this.lastNotes = summarizeReleaseNotes(info.releaseNotes)
        this.emit({ status: 'available', version: info.version, notes: this.lastNotes })
      })
      autoUpdater.on('update-not-available', () => this.emit({ status: 'up-to-date' }))
      autoUpdater.on('download-progress', (p) =>
        this.emit({ status: 'downloading', percent: Math.round(p.percent), notes: this.lastNotes }),
      )
      autoUpdater.on('update-downloaded', (info) =>
        this.emit({
          status: 'downloaded',
          version: info.version,
          notes: summarizeReleaseNotes(info.releaseNotes) ?? this.lastNotes,
        }),
      )
      autoUpdater.on('error', (err) =>
        this.emit({ status: 'error', error: err instanceof Error ? err.message : String(err) }),
      )
      this.winWired = true
    }
    autoUpdater
      .checkForUpdates()
      .catch((err) =>
        this.emit({ status: 'error', error: err instanceof Error ? err.message : String(err) }),
      )
  }

  /** macOS path: compare the latest GitHub release to the running version. */
  private async checkMac(): Promise<void> {
    try {
      const res = await fetch(RELEASES_API, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Slate-Updater' },
      })
      if (!res.ok) {
        this.emit({ status: 'error', error: `GitHub API ${res.status}` })
        return
      }
      const data = (await res.json()) as { tag_name?: string; html_url?: string; body?: string }
      const latest = data.tag_name ?? ''
      if (latest && semverGt(latest, app.getVersion())) {
        this.emit({
          status: 'available',
          version: latest.replace(/^v/i, ''),
          url: data.html_url ?? `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
          notes: summarizeReleaseNotes(data.body),
        })
      } else {
        this.emit({ status: 'up-to-date' })
      }
    } catch (err) {
      this.emit({ status: 'error', error: err instanceof Error ? err.message : String(err) })
    }
  }
}
