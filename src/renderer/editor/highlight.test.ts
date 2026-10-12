import { describe, expect, it } from 'vitest'
import { collectMarkup, findFencedCode, findHighlights } from './highlight'

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

describe('findFencedCode', () => {
  it('finds a closed backtick fence spanning whole lines', () => {
    const doc = 'a\n```js\nx\n```\nb'
    expect(findFencedCode(doc)).toEqual([{ from: 2, to: 13 }])
  })

  it('runs an unclosed fence to the end of the document', () => {
    const doc = 'a\n~~~\n**x**'
    expect(findFencedCode(doc)).toEqual([{ from: 2, to: doc.length }])
  })

  it('needs a closing fence at least as long, of the same char', () => {
    const doc = '````\n```\n~~~\n````'
    expect(findFencedCode(doc)).toEqual([{ from: 0, to: doc.length }])
  })
})

describe('collectMarkup', () => {
  const hiddenText = (doc: string) => collectMarkup(doc).hidden.map((r) => doc.slice(r.from, r.to))
  const styledOf = (doc: string, kind: string) =>
    collectMarkup(doc)
      .styled.filter((s) => s.kind === kind)
      .map((s) => doc.slice(s.from, s.to))

  it('hides markers and styles the inner text', () => {
    const doc = '**b** _i_ ++u++ ~~s~~ `c` ==h=={.yellow} {color:red}r{/color} {size:20}z{/size}'
    expect(hiddenText(doc)).toEqual([
      '**',
      '**',
      '_',
      '_',
      '++',
      '++',
      '~~',
      '~~',
      '`',
      '`',
      '==',
      '=={.yellow}',
      '{color:red}',
      '{/color}',
      '{size:20}',
      '{/size}',
    ])
    expect(styledOf(doc, 'bold')).toEqual(['b'])
    expect(styledOf(doc, 'size')).toEqual(['z'])
  })

  it('leaves markers inside a fenced code block alone', () => {
    const doc =
      'before\n```python\nx = a**b**c\nname_one_two = `x`\n{color:red}y{/color}\n```\nafter **b**'
    const m = collectMarkup(doc)
    const fenceEnd = doc.indexOf('```\nafter') + 3
    expect(m.hidden.every((r) => r.from >= fenceEnd)).toBe(true)
    expect(m.styled.every((s) => s.from >= fenceEnd)).toBe(true)
    expect(styledOf(doc, 'bold')).toEqual(['b'])
  })

  it('leaves markers inside tree-reported code (indented block / inline) alone', () => {
    const doc = 'text\n\n    **not bold**\n'
    const block = { from: 6, to: doc.length - 1 }
    expect(collectMarkup(doc, { block: [block] }).hidden).toEqual([])
  })

  it('does not style markers inside inline code', () => {
    const doc = 'see `a **b** c` here'
    expect(styledOf(doc, 'bold')).toEqual([])
    expect(styledOf(doc, 'code')).toEqual(['a **b** c'])
  })

  it('never matches inline code across lines or fence lines', () => {
    expect(styledOf('a `b\nc` d', 'code')).toEqual([])
    const doc = '```\ncode\n```'
    expect(styledOf(doc, 'code')).toEqual([])
    expect(collectMarkup(doc).hidden).toEqual([])
  })

  it('does not pair inline markers across a blank line', () => {
    const doc = 'a ** stray\n\nnext **bold**'
    expect(styledOf(doc, 'bold')).toEqual(['bold'])
  })

  it('still pairs markers across a soft line break', () => {
    expect(styledOf('**one\ntwo**', 'bold')).toEqual(['one\ntwo'])
  })

  it('pairs nested font sizes like brackets', () => {
    const doc = '{size:20}a {size:14}b{/size} c{/size}'
    expect(hiddenText(doc)).toEqual(['{size:20}', '{size:14}', '{/size}', '{/size}'])
    const sizes = collectMarkup(doc)
      .styled.filter((s) => s.kind === 'size')
      .map((s) => (s.kind === 'size' ? [doc.slice(s.from, s.to), s.size] : null))
    expect(sizes).toEqual([
      ['a {size:14}b{/size} c', 20],
      ['b', 14],
    ])
  })

  it('merges overlapping hidden ranges instead of dropping one (no raw markers)', () => {
    // `{align:center}` and a color opener share no chars, but adjacent markers
    // must come out sorted and non-overlapping for RangeSet.
    const doc = '{align:center}{color:red}**x**{/color}'
    const hidden = collectMarkup(doc).hidden
    for (let i = 1; i < hidden.length; i++)
      expect(hidden[i].from).toBeGreaterThanOrEqual(hidden[i - 1].to)
    const shown = hidden.reduceRight((s, r) => s.slice(0, r.from) + s.slice(r.to), doc)
    expect(shown).toBe('x')
  })

  it('renders every marker of nested formatting hidden', () => {
    const doc = '==**_x_**=={.red} ++~~y~~++'
    const hidden = collectMarkup(doc).hidden
    const shown = hidden.reduceRight((s, r) => s.slice(0, r.from) + s.slice(r.to), doc)
    expect(shown).toBe('x y')
  })
})
