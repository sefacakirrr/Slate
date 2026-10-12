import type { Language } from '@shared/types'

/**
 * Pure translation core (no React, no `window`), shared by the store-bound
 * `t`/`useT` in `./index.ts` and the dictionary unit test.
 *
 * Dictionary shape: nested groups of strings. A leaf is either a string or a
 * plural form `{ one, other }` (an object with exactly those two keys), chosen
 * with `Intl.PluralRules` from the `count` param. `{name}` placeholders are
 * replaced from params; unknown placeholders are left as-is.
 */
export type Plural = { one: string; other: string }

export type DictNode = { [key: string]: string | Plural | DictNode }

/** Widens a dictionary's literal type to its shape, so the other language must mirror it. */
export type Shape<T> = {
  [K in keyof T]: T[K] extends string ? string : Shape<T[K]>
}

type IsPlural<T> = T extends Plural
  ? Exclude<keyof T, 'one' | 'other'> extends never
    ? true
    : false
  : false

/** Every dotted leaf path of a dictionary (`'sidebar.newNote'`, `'common.cancel'`, …). */
export type Leaves<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string
    ? `${P}${K}`
    : IsPlural<T[K]> extends true
      ? `${P}${K}`
      : Leaves<T[K], `${P}${K}.`>
}[keyof T & string]

export type Params = Record<string, string | number>

/** BCP 47 tag used for Intl formatting and locale-aware casing. */
export function localeTag(language: Language): string {
  return language === 'tr' ? 'tr-TR' : 'en-US'
}

export function isPlural(node: unknown): node is Plural {
  if (node === null || typeof node !== 'object') return false
  const keys = Object.keys(node)
  return keys.length === 2 && keys.includes('one') && keys.includes('other')
}

export function interpolate(text: string, params?: Params): string {
  if (!params) return text
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : match,
  )
}

const pluralRules = new Map<Language, Intl.PluralRules>()
function pluralCategory(language: Language, count: number): 'one' | 'other' {
  let rules = pluralRules.get(language)
  if (!rules) {
    rules = new Intl.PluralRules(localeTag(language))
    pluralRules.set(language, rules)
  }
  return rules.select(count) === 'one' ? 'one' : 'other'
}

function lookup(dict: DictNode, key: string): string | Plural | DictNode | undefined {
  let node: string | Plural | DictNode | undefined = dict
  for (const part of key.split('.')) {
    if (node === undefined || typeof node === 'string') return undefined
    node = (node as DictNode)[part]
  }
  return node
}

/**
 * Resolves `key` in `dict` (falling back to `fallback`, then to the key itself),
 * picks the plural form from `params.count`, and fills placeholders.
 */
export function translate(
  dict: DictNode,
  fallback: DictNode,
  language: Language,
  key: string,
  params?: Params,
): string {
  let node = lookup(dict, key)
  if (node === undefined) node = lookup(fallback, key)
  if (typeof node === 'string') return interpolate(node, params)
  if (isPlural(node)) {
    const count = Number(params?.count ?? 0)
    return interpolate(node[pluralCategory(language, count)], params)
  }
  return key
}
