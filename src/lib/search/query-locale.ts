/**
 * Which tokenizer a query should be segmented with.
 *
 * Meilisearch (>= 1.10) accepts a `locales` search parameter that pins the
 * query-side tokenizer the way `localizedAttributes` pins the index side.
 * Without it Charabia guesses the script per token, and a guess on a
 * two-word query is exactly as unreliable as the guess on a two-word product
 * name the index settings already refuse (meili-settings.ts, HEBREW_LOCALES).
 *
 * Detection here is by SCRIPT, not by language: a Hebrew-script query is
 * Hebrew, Cyrillic is Russian, Arabic script is Arabic, and Latin is English.
 * That is the whole of what the storefront serves -- Hebrew first, English on
 * `name_en` and `brand`, and the two other languages an Israeli shopper is
 * likely to type in -- and it is deliberately not a language detector: on a
 * three-letter query no detector is better than the script itself.
 *
 * A query with no letters at all (a SKU, a barcode, a price) returns nothing,
 * and the caller omits the parameter rather than sending an empty list.
 */

export type MeiliLocale = 'heb' | 'eng' | 'rus' | 'ara'

const SCRIPTS: readonly { locale: MeiliLocale; pattern: RegExp }[] = [
  { locale: 'heb', pattern: /[֐-׿]/ },
  { locale: 'eng', pattern: /[A-Za-z]/ },
  { locale: 'rus', pattern: /[Ѐ-ӿ]/ },
  { locale: 'ara', pattern: /[؀-ۿݐ-ݿ]/ },
]

/** The locales whose script appears in the query, in a stable order. */
export function detectQueryLocales(query: string): MeiliLocale[] {
  const q = query ?? ''
  return SCRIPTS.filter(({ pattern }) => pattern.test(q)).map(({ locale }) => locale)
}

/**
 * The `locales` fragment for a Meilisearch search body: present only when
 * there is something to say. Spread into the request the way `sort` is.
 */
export function localesParam(query: string): { locales?: MeiliLocale[] } {
  const locales = detectQueryLocales(query)
  return locales.length > 0 ? { locales } : {}
}
