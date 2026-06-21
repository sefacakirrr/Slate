import { describe, expect, it } from 'vitest'
import { extractTags } from './extractTags'

describe('extractTags', () => {
  describe('basic extraction', () => {
    it('extracts a simple tag', () => {
      expect(extractTags('Hello #world')).toEqual(['world'])
    })

    it('extracts multiple tags', () => {
      const result = extractTags('#javascript is great and #react too')
      expect(result).toContain('javascript')
      expect(result).toContain('react')
      expect(result).toHaveLength(2)
    })

    it('extracts tag at start of line', () => {
      expect(extractTags('#typescript rocks')).toEqual(['typescript'])
    })

    it('extracts tag at end of content', () => {
      expect(extractTags('tagged #done')).toEqual(['done'])
    })

    it('extracts tags with hyphens and underscores', () => {
      const result = extractTags('#my-tag #another_tag')
      expect(result).toContain('my-tag')
      expect(result).toContain('another_tag')
    })

    it('extracts tag after punctuation', () => {
      expect(extractTags('check this: #important')).toContain('important')
      expect(extractTags('(#parenthesized)')).toContain('parenthesized')
    })

    it('extracts tag in list item', () => {
      expect(extractTags('- #todo fix the bug')).toContain('todo')
    })
  })

  describe('normalization', () => {
    it('normalizes to lowercase', () => {
      expect(extractTags('#JavaScript')).toEqual(['javascript'])
    })

    it('deduplicates case variants', () => {
      const result = extractTags('#FOO #foo #Foo')
      expect(result).toEqual(['foo'])
    })
  })

  describe('exclusions — must NOT extract', () => {
    it('ignores markdown headings (space after #)', () => {
      expect(extractTags('# Heading')).toEqual([])
      expect(extractTags('## Second heading')).toEqual([])
    })

    it('ignores tags inside fenced code blocks', () => {
      const content = '```\n#include <stdio.h>\n```'
      expect(extractTags(content)).toEqual([])
    })

    it('ignores tags inside fenced code blocks with language', () => {
      const content = '```c\n#include <stdio.h>\n#define FOO\n```'
      expect(extractTags(content)).toEqual([])
    })

    it('ignores tags inside tilde fenced code blocks', () => {
      const content = '~~~\n#notag\n~~~'
      expect(extractTags(content)).toEqual([])
    })

    it('ignores tags inside inline code', () => {
      expect(extractTags('use `#channel` for that')).toEqual([])
    })

    it('ignores tags inside double-backtick inline code', () => {
      expect(extractTags('use ``#channel`` for that')).toEqual([])
    })

    it('ignores URL fragments', () => {
      expect(extractTags('Visit http://example.com#section')).toEqual([])
    })

    it('ignores URL fragments with https', () => {
      expect(extractTags('See https://docs.rs/crate#methods')).toEqual([])
    })

    it('ignores numeric-only after #', () => {
      expect(extractTags('#123 is not a tag')).toEqual([])
    })

    it('ignores single char tags (min 2)', () => {
      expect(extractTags('#a is too short')).toEqual([])
    })

    it('ignores tags longer than 64 chars', () => {
      const longTag = `#a${'b'.repeat(64)}`
      expect(extractTags(longTag)).toEqual([])
    })

    it('ignores # not at word boundary', () => {
      expect(extractTags('C#programming')).toEqual([])
    })
  })

  describe('mixed content', () => {
    it('extracts tags outside code blocks while ignoring inside', () => {
      const content = `
#real-tag here

\`\`\`js
// #fake-tag inside code
const x = 1
\`\`\`

And #another-real one
`
      const result = extractTags(content)
      expect(result).toContain('real-tag')
      expect(result).toContain('another-real')
      expect(result).not.toContain('fake-tag')
      expect(result).toHaveLength(2)
    })

    it('handles content with URLs and tags together', () => {
      const content = 'Check https://example.com#fragment and also #valid-tag'
      const result = extractTags(content)
      expect(result).toEqual(['valid-tag'])
    })

    it('handles empty content', () => {
      expect(extractTags('')).toEqual([])
    })

    it('handles content with no tags', () => {
      expect(extractTags('Just plain text with no hashtags')).toEqual([])
    })

    it('handles content that is only code blocks', () => {
      const content = '```\n#all #inside #code\n```'
      expect(extractTags(content)).toEqual([])
    })
  })

  describe('unicode support', () => {
    it('extracts tags with accented characters', () => {
      expect(extractTags('#café is nice')).toContain('café')
    })

    it('extracts tags with German umlauts', () => {
      expect(extractTags('#über cool')).toContain('über')
    })
  })

  describe('edge cases', () => {
    it('handles adjacent hash symbols', () => {
      // #one#two — second # is not at word boundary
      const result = extractTags('#one#two')
      expect(result).toEqual(['one'])
    })

    it('handles tag followed by newline', () => {
      expect(extractTags('#tag\nnext line')).toContain('tag')
    })

    it('handles multiple tags on same line', () => {
      const result = extractTags('#alpha #beta #gamma')
      expect(result).toHaveLength(3)
    })

    it('tag at max length (64) is accepted', () => {
      const name = `a${'b'.repeat(63)}`
      const result = extractTags(`#${name}`)
      expect(result).toEqual([name])
    })
  })
})
