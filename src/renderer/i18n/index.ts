import type { Language } from '@shared/types'
import { useMemo } from 'react'
import { create } from 'zustand'
import { type Dict, en } from './en'
import { tr } from './tr'
import { type DictNode, type Leaves, localeTag, type Params, translate } from './translate'

/**
 * Renderer i18n. Usage:
 *   - components: `const t = useT()` then `t('sidebar.newNote')` — re-renders on a switch;
 *   - non-React code (stores, CodeMirror widgets): `t('errors.fileExists')` reads the
 *     active language at call time.
 * Plurals: `t('common.notesCount', { count: n })`. Placeholders: `{name}`.
 *
 * The active language lives in `useLanguageStore`; `./init.ts` loads it from
 * main (settings) and follows `language:changed` broadcasts, so every window
 * (main, sticky, quick capture) switches live. This module never touches
 * `window.api`, so stores that import it stay unit-testable under Node.
 */
export type TKey = Leaves<Dict>
export type TFunction = (key: TKey, params?: Params) => string
export type { Params } from './translate'
export { localeTag } from './translate'

const DICTS: Record<Language, DictNode> = { en, tr }

type LanguageState = { language: Language }

export const useLanguageStore = create<LanguageState>(() => ({ language: 'en' }))

function makeT(language: Language): TFunction {
  return (key, params) => translate(DICTS[language], en, language, key, params)
}

// One stable function per language, so `t` only changes identity on a switch.
const T_BY_LANGUAGE: Record<Language, TFunction> = { en: makeT('en'), tr: makeT('tr') }

export function getLanguage(): Language {
  return useLanguageStore.getState().language
}

/** Applies a language locally (no persistence — see `setLanguage` in `./init`). */
export function applyLanguage(language: Language): void {
  if (language !== 'en' && language !== 'tr') return
  useLanguageStore.setState({ language })
  if (typeof document !== 'undefined') document.documentElement.lang = language
}

/** Translate in the active language (non-React code; components should use `useT`). */
export const t: TFunction = (key, params) => T_BY_LANGUAGE[getLanguage()](key, params)

/** The active language; re-renders the component when it changes. */
export function useLanguage(): Language {
  return useLanguageStore((s) => s.language)
}

/** A `t` bound to the active language; re-renders the component when it changes. */
export function useT(): TFunction {
  return T_BY_LANGUAGE[useLanguage()]
}

/** BCP 47 tag of the active language, for `Intl`/`toLocale*` calls. */
export function currentLocale(): string {
  return localeTag(getLanguage())
}

/** Locale-aware upper-casing (Turkish i → İ). */
export function upper(text: string, language: Language = getLanguage()): string {
  return text.toLocaleUpperCase(localeTag(language))
}

/** "just now" / "5 min ago" / "3 h ago" / "2 days ago" for a past timestamp. */
export function formatRelativeTime(timestamp: number, now: number = Date.now()): string {
  const min = Math.floor((now - timestamp) / 60_000)
  if (min < 1) return t('common.time.justNow')
  if (min < 60) return t('common.time.minutesAgo', { count: min })
  const hours = Math.floor(min / 60)
  if (hours < 24) return t('common.time.hoursAgo', { count: hours })
  return t('common.time.daysAgo', { count: Math.floor(hours / 24) })
}

/** First day of the calendar week: Monday in Turkish, Sunday in English. */
export function weekStartsOn(language: Language = getLanguage()): 0 | 1 {
  return language === 'tr' ? 1 : 0
}

/** Month names (January…) in the given language, via Intl. */
export function monthNames(language: Language = getLanguage()): string[] {
  const fmt = new Intl.DateTimeFormat(localeTag(language), { month: 'long' })
  return Array.from({ length: 12 }, (_, m) => fmt.format(new Date(2024, m, 1)))
}

/**
 * Short weekday labels in display order, starting at `weekStartsOn`
 * (e.g. en: Su Mo …; tr: Pzt Sal …), via Intl.
 */
export function weekdayLabels(language: Language = getLanguage()): string[] {
  const fmt = new Intl.DateTimeFormat(localeTag(language), { weekday: 'short' })
  const start = weekStartsOn(language)
  // 2024-01-07 is a Sunday.
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2024, 0, 7 + start + i)))
}

/** `useMemo` helper for values derived from the active language. */
export function useLocaleMemo<T>(fn: (language: Language) => T): T {
  const language = useLanguage()
  // biome-ignore lint/correctness/useExhaustiveDependencies: recompute only on a language switch
  return useMemo(() => fn(language), [language])
}
