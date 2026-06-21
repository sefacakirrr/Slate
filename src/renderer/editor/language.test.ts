import { describe, expect, it } from 'vitest'
import { languageExtension } from './language'

/**
 * `languageExtension` returns a markdown `LanguageSupport` (a non-array object)
 * for markdown files, and an empty extension array for everything else. We
 * assert on that array-vs-object distinction rather than inspecting CM6
 * internals.
 */
describe('languageExtension', () => {
  it('returns a markdown language for .md', () => {
    expect(Array.isArray(languageExtension('notes/today.md'))).toBe(false)
  })

  it('returns a markdown language for .markdown', () => {
    expect(Array.isArray(languageExtension('a.markdown'))).toBe(false)
  })

  it('is case-insensitive on the extension', () => {
    expect(Array.isArray(languageExtension('A.MD'))).toBe(false)
  })

  it('returns plain (empty extension) for .txt', () => {
    expect(languageExtension('a.txt')).toEqual([])
  })

  it('returns plain for unknown extensions', () => {
    expect(languageExtension('a.rs')).toEqual([])
  })

  it('returns plain for a path with no extension', () => {
    expect(languageExtension('README')).toEqual([])
  })
})
