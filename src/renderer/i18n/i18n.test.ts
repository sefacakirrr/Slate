import { describe, expect, it } from 'vitest'
import { en } from './en'
import { applyLanguage, formatRelativeTime, t, upper, weekdayLabels } from './index'
import { tr } from './tr'
import { type DictNode, isPlural, translate } from './translate'

type Leaf = { path: string; texts: string[] }

/** Flattens a dictionary into leaves; a plural leaf carries both forms. */
function leaves(node: DictNode, prefix = ''): Leaf[] {
  const out: Leaf[] = []
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') out.push({ path, texts: [value] })
    else if (isPlural(value)) out.push({ path, texts: [value.one, value.other] })
    else out.push(...leaves(value as DictNode, path))
  }
  return out
}

function placeholders(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
}

const enLeaves = leaves(en as DictNode)
const trLeaves = leaves(tr as DictNode)

describe('i18n dictionaries', () => {
  it('have exactly the same keys in English and Turkish', () => {
    const enKeys = enLeaves.map((l) => l.path).sort()
    const trKeys = trLeaves.map((l) => l.path).sort()
    expect(trKeys).toEqual(enKeys)
  })

  it('use the same leaf kind (string vs plural) in both languages', () => {
    const trByPath = new Map(trLeaves.map((l) => [l.path, l]))
    for (const leaf of enLeaves) {
      expect(trByPath.get(leaf.path)?.texts.length, leaf.path).toBe(leaf.texts.length)
    }
  })

  it('contain no empty strings', () => {
    for (const leaf of [...enLeaves, ...trLeaves]) {
      for (const text of leaf.texts) expect(text.trim(), leaf.path).not.toBe('')
    }
  })

  it('use the same placeholders in both languages', () => {
    const trByPath = new Map(trLeaves.map((l) => [l.path, l]))
    for (const leaf of enLeaves) {
      const other = trByPath.get(leaf.path)
      if (!other) continue
      // Plural: compare the `other` form (the `one` form may spell out "1").
      const enText = leaf.texts[leaf.texts.length - 1]
      const trText = other.texts[other.texts.length - 1]
      expect(placeholders(trText), leaf.path).toEqual(placeholders(enText))
    }
  })
})

describe('translate', () => {
  it('interpolates params and picks plural forms', () => {
    expect(translate(en as DictNode, en as DictNode, 'en', 'common.notesCount', { count: 1 })).toBe(
      '1 note',
    )
    expect(translate(en as DictNode, en as DictNode, 'en', 'common.notesCount', { count: 3 })).toBe(
      '3 notes',
    )
    expect(translate(tr as DictNode, en as DictNode, 'tr', 'common.notesCount', { count: 3 })).toBe(
      '3 not',
    )
  })

  it('returns the key for an unknown path', () => {
    expect(translate(en as DictNode, en as DictNode, 'en', 'nope.missing')).toBe('nope.missing')
  })

  it('follows the active language', () => {
    applyLanguage('tr')
    expect(t('common.cancel')).toBe('İptal')
    expect(formatRelativeTime(Date.now() - 5 * 60_000)).toBe('5 dk önce')
    expect(upper('istanbul')).toBe('İSTANBUL')
    expect(weekdayLabels()[0]).toMatch(/^Pzt/)
    applyLanguage('en')
    expect(t('common.cancel')).toBe('Cancel')
    expect(formatRelativeTime(Date.now() - 2 * 86_400_000)).toBe('2 days ago')
    expect(weekdayLabels()[0]).toBe('Sun')
  })
})
