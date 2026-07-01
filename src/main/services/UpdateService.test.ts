import { describe, expect, it } from 'vitest'
import { semverGt } from './UpdateService'

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
