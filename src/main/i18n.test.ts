import { describe, expect, it } from 'vitest'
import { languageFromLocale, MAIN_DICTS, setMainLanguage, tm } from './i18n'

describe('main i18n', () => {
  it('maps OS locales to a language', () => {
    expect(languageFromLocale('tr')).toBe('tr')
    expect(languageFromLocale('tr-TR')).toBe('tr')
    expect(languageFromLocale('en-US')).toBe('en')
    expect(languageFromLocale('de')).toBe('en')
    expect(languageFromLocale('')).toBe('en')
  })

  it('has the same non-empty keys in both languages', () => {
    for (const section of Object.keys(MAIN_DICTS.en) as (keyof typeof MAIN_DICTS.en)[]) {
      const enKeys = Object.keys(MAIN_DICTS.en[section]).sort()
      expect(Object.keys(MAIN_DICTS.tr[section]).sort()).toEqual(enKeys)
      for (const k of enKeys) {
        const trText = (MAIN_DICTS.tr[section] as Record<string, string>)[k]
        const enText = (MAIN_DICTS.en[section] as Record<string, string>)[k]
        expect(trText.trim()).not.toBe('')
        const ph = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
        expect(ph(trText)).toEqual(ph(enText))
      }
    }
  })

  it('follows the active language', () => {
    setMainLanguage('tr')
    expect(tm('tray.quit')).toBe("Slate'ten Çık")
    setMainLanguage('en')
    expect(tm('tray.quit')).toBe('Quit Slate')
  })
})
