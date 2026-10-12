import { describe, expect, it } from 'vitest'
import { createPathMapper } from './pathRemap'

describe('createPathMapper', () => {
  it('maps a renamed file and leaves others alone', () => {
    const map = createPathMapper({ kind: 'file', from: 'a/note.md', to: 'b/renamed.md' }, false)
    expect(map('a/note.md')).toBe('b/renamed.md')
    expect(map('a/note.md.enc')).toBeNull()
    expect(map('a/other.md')).toBeNull()
  })

  it('maps lock/unlock (.enc suffix) as file changes', () => {
    expect(createPathMapper({ kind: 'file', from: 'x.md', to: 'x.md.enc' }, false)('x.md')).toBe(
      'x.md.enc',
    )
    expect(
      createPathMapper({ kind: 'file', from: 'x.md.enc', to: 'x.md' }, false)('x.md.enc'),
    ).toBe('x.md')
  })

  it('rewrites the prefix of every note under a renamed folder, at any depth', () => {
    const map = createPathMapper({ kind: 'folder', from: 'Work/Box', to: 'Archive/Crate' }, false)
    expect(map('Work/Box/a.md')).toBe('Archive/Crate/a.md')
    expect(map('Work/Box/deep/b.md')).toBe('Archive/Crate/deep/b.md')
    expect(map('Work/a.md')).toBeNull()
  })

  it('never matches a sibling that merely shares the prefix ("a/" vs "ab/")', () => {
    const map = createPathMapper({ kind: 'folder', from: 'a', to: 'z' }, true)
    expect(map('ab/x.md')).toBeNull()
    expect(map('a.md')).toBeNull()
    expect(map('a/x.md')).toBe('z/x.md')
  })

  it('handles case-only renames and differently-cased records on case-insensitive FS', () => {
    const file = createPathMapper({ kind: 'file', from: 'note.md', to: 'Note.md' }, true)
    expect(file('note.md')).toBe('Note.md')
    expect(file('NOTE.md')).toBe('Note.md')
    const folder = createPathMapper({ kind: 'folder', from: 'Box', to: 'box' }, true)
    expect(folder('Box/a.md')).toBe('box/a.md')
    expect(folder('BOX/Sub/A.md')).toBe('box/Sub/A.md')
  })

  it('is exact-case on case-sensitive FS', () => {
    const map = createPathMapper({ kind: 'file', from: 'note.md', to: 'Note.md' }, false)
    expect(map('note.md')).toBe('Note.md')
    expect(map('NOTE.md')).toBeNull()
  })
})
