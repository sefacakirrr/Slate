import { describe, expect, it } from 'vitest'
import { splitSnippet } from './searchHighlight'

// The markers SearchService emits around matched terms (private-use code points
// U+E000 / U+E001). Built via fromCharCode so the source stays plain ASCII.
const OPEN = String.fromCharCode(0xe000)
const CLOSE = String.fromCharCode(0xe001)

describe('splitSnippet', () => {
  it('returns a single plain segment when there are no markers', () => {
    expect(splitSnippet('just some context')).toEqual([
      { text: 'just some context', highlight: false },
    ])
  })

  it('splits one highlighted term out of surrounding context', () => {
    expect(splitSnippet(`before ${OPEN}match${CLOSE} after`)).toEqual([
      { text: 'before ', highlight: false },
      { text: 'match', highlight: true },
      { text: ' after', highlight: false },
    ])
  })

  it('handles multiple highlighted terms', () => {
    expect(splitSnippet(`${OPEN}one${CLOSE} mid ${OPEN}two${CLOSE}`)).toEqual([
      { text: 'one', highlight: true },
      { text: ' mid ', highlight: false },
      { text: 'two', highlight: true },
    ])
  })

  it('drops empty segments (adjacent markers, leading/trailing marks)', () => {
    expect(splitSnippet(`${OPEN}a${CLOSE}${OPEN}b${CLOSE}`)).toEqual([
      { text: 'a', highlight: true },
      { text: 'b', highlight: true },
    ])
  })

  it('tolerates an unbalanced trailing open marker (renders the rest plain)', () => {
    expect(splitSnippet(`ok ${OPEN}dangling`)).toEqual([
      { text: 'ok ', highlight: false },
      { text: 'dangling', highlight: false },
    ])
  })

  it('returns an empty array for an empty snippet', () => {
    expect(splitSnippet('')).toEqual([])
  })
})
