import { describe, expect, it } from 'vitest'
import { findHighlights } from './highlight'

describe('findHighlights', () => {
  it('finds a single yellow highlight', () => {
    const doc = 'hello ==world=={.yellow} end'
    const results = findHighlights(doc)
    expect(results).toHaveLength(1)
    expect(results[0].text).toBe('world')
    expect(results[0].color).toBe('yellow')
    expect(results[0].from).toBe(6)
    expect(results[0].to).toBe(24)
  })

  it('finds multiple highlights', () => {
    const doc = '==foo=={.green} bar ==baz=={.pink}'
    const results = findHighlights(doc)
    expect(results).toHaveLength(2)
    expect(results[0].color).toBe('green')
    expect(results[1].color).toBe('pink')
  })

  it('ignores invalid colors', () => {
    const doc = '==text=={.magenta}'
    const results = findHighlights(doc)
    expect(results).toHaveLength(0)
  })

  it('handles empty doc', () => {
    expect(findHighlights('')).toHaveLength(0)
  })

  it('handles highlight at start of doc', () => {
    const doc = '==start=={.blue} rest'
    const results = findHighlights(doc)
    expect(results).toHaveLength(1)
    expect(results[0].text).toBe('start')
    expect(results[0].from).toBe(0)
  })

  it('does not match incomplete syntax', () => {
    expect(findHighlights('==no close')).toHaveLength(0)
    expect(findHighlights('no open=={.yellow}')).toHaveLength(0)
    expect(findHighlights('==missing attr==')).toHaveLength(0)
  })
})
