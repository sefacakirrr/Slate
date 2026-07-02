import { describe, expect, it } from 'vitest'
import { semverGt, summarizeReleaseNotes } from './UpdateService'

/** Pure version-compare used by the macOS update check (Epic 12). */
describe('semverGt', () => {
  it('detects a newer version across each component', () => {
    expect(semverGt('0.2.0', '0.1.9')).toBe(true)
    expect(semverGt('1.0.0', '0.9.9')).toBe(true)
    expect(semverGt('0.1.10', '0.1.9')).toBe(true)
  })

  it('is false for equal or older versions', () => {
    expect(semverGt('0.1.9', '0.1.9')).toBe(false)
    expect(semverGt('0.1.8', '0.1.9')).toBe(false)
    expect(semverGt('1.0.0', '1.0.1')).toBe(false)
  })

  it('tolerates a leading v on either side', () => {
    expect(semverGt('v0.2.0', '0.1.9')).toBe(true)
    expect(semverGt('0.2.0', 'v0.1.9')).toBe(true)
    expect(semverGt('v1.2.3', 'v1.2.3')).toBe(false)
  })

  it('treats missing components as 0', () => {
    expect(semverGt('1', '0.9.9')).toBe(true)
    expect(semverGt('1.0', '1.0.0')).toBe(false)
  })
})

/** Release-notes → short plain-text "What's new" summary (settings panel). */
describe('summarizeReleaseNotes', () => {
  it('converts a GitHub markdown body to plain bullet text', () => {
    const body = '## Changes\n\n- **Auto-save** toggle\n- Image resize\n* Import wizard'
    expect(summarizeReleaseNotes(body)).toBe(
      'Changes\n• Auto-save toggle\n• Image resize\n• Import wizard',
    )
  })

  it('converts electron-updater HTML notes to plain text', () => {
    const html = '<h2>What&#39;s new</h2><ul><li>Fix &amp; polish</li><li>Faster search</li></ul>'
    expect(summarizeReleaseNotes(html)).toBe("What's new\n• Fix & polish\n• Faster search")
  })

  it('joins the per-version array form', () => {
    const notes = [
      { version: '0.2.0', note: 'Import wizard' },
      { version: '0.1.11', note: null },
    ]
    expect(summarizeReleaseNotes(notes)).toBe('0.2.0: Import wizard')
  })

  it('returns undefined for empty or whitespace notes', () => {
    expect(summarizeReleaseNotes(undefined)).toBeUndefined()
    expect(summarizeReleaseNotes(null)).toBeUndefined()
    expect(summarizeReleaseNotes('')).toBeUndefined()
    expect(summarizeReleaseNotes('  \n\n  ')).toBeUndefined()
  })

  it('truncates long notes with an ellipsis', () => {
    const long = Array.from({ length: 20 }, (_, i) => `- change number ${i}`).join('\n')
    const summary = summarizeReleaseNotes(long)
    expect(summary).toBeDefined()
    expect(summary?.split('\n').length).toBeLessThanOrEqual(9) // 8 lines + '…'
    expect(summary?.endsWith('…')).toBe(true)
  })
})
