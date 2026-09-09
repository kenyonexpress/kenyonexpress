import { DEFAULT_LOCALE, type LocaleCode } from '@/lib/i18n/locales'
import en from '../../../messages/en.json'
import he from '../../../messages/he.json'

/**
 * The message catalog, typed, and read synchronously.
 *
 * =========================================================================
 * WHY THIS IS NOT `useTranslations` FROM next-intl
 * =========================================================================
 *
 * next-intl is installed and its plugin is wired, and it stays wired: when a
 * second locale is switched on, its routing and its request config are what
 * turn a URL segment into a locale. What is NOT used yet is its RUNTIME.
 *
 * `getTranslations` reads the request locale, which makes the component that
 * calls it request-dependent. Under `cacheComponents` that is the difference
 * between a statically prerendered page and a dynamic one, and the pages this
 * would touch first are the home page - whose hero is the LCP element and whose
 * static output is measured - the footer, which is in every layout, and the
 * account nav. Introducing a per-request read into all three, to support one
 * locale, would trade the site's static rendering for a capability nobody can
 * reach yet.
 *
 * `useTranslations` in a client component needs `NextIntlClientProvider`, which
 * serialises the whole catalog into the RSC payload of every page.
 *
 * So while exactly one locale is active, the catalog is COMPILED IN and read
 * synchronously. `t('nav.home')` is a property lookup: it cannot make a page
 * dynamic, it cannot fail at runtime, and it costs nothing. The day a second
 * locale is routed, `t` takes its locale from the route segment and this file
 * is where that happens - not 275 components.
 *
 * =========================================================================
 * THE TYPE IS DERIVED FROM THE HEBREW CATALOG, NOT DECLARED
 * =========================================================================
 *
 * `MessageKey` is computed from `messages/he.json` itself, so a key that is not
 * in the catalog does not compile and a key deleted from the catalog breaks
 * every call site at build time rather than rendering `undefined` in a footer.
 * Hebrew is the source because Hebrew is the active locale; English is checked
 * against it key-for-key by `messages.test.ts`.
 */

type Catalog = typeof he

/** Dotted paths to every string leaf. `nav.home`, and not `nav`. */
type Leaves<T> = T extends string
  ? ''
  : {
      [K in keyof T & string]: Leaves<T[K]> extends '' ? K : `${K}.${Leaves<T[K]>}`
    }[keyof T & string]

export type MessageKey = Leaves<Catalog>

const CATALOGS: Record<LocaleCode, unknown> = { he, en }

/**
 * One message.
 *
 * A MISSING KEY RETURNS THE KEY ITSELF, and never an empty string. The type
 * makes a missing key impossible for `he`, so this path is only reachable for a
 * PREPARED locale whose catalog has drifted - and there the visible `nav.home`
 * in the middle of a page is a bug report, while an empty string is a gap
 * nobody notices until a customer asks what the blank button does.
 */
export function t(key: MessageKey, locale: LocaleCode = DEFAULT_LOCALE): string {
  const value = lookup(CATALOGS[locale], key)
  if (typeof value === 'string') return value
  // Falling back to Hebrew before giving up: a prepared locale missing one key
  // should show the Hebrew word rather than a dotted path, which is what a
  // half-translated page looks like everywhere else.
  const fallback = locale === DEFAULT_LOCALE ? undefined : lookup(CATALOGS[DEFAULT_LOCALE], key)
  return typeof fallback === 'string' ? fallback : key
}

function lookup(catalog: unknown, key: string): unknown {
  let node: unknown = catalog
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined
    node = (node as Record<string, unknown>)[part]
  }
  return node
}

/**
 * Every key in a catalog, flattened. Used by the parity test and by nothing
 * else: a runtime that needs the whole list is a runtime building a page out of
 * the catalog's shape, which is how a missing key becomes a missing section.
 */
export function messageKeys(catalog: unknown = he): string[] {
  const keys: string[] = []
  const walk = (node: unknown, prefix: string) => {
    if (typeof node !== 'object' || node === null) return
    for (const [name, value] of Object.entries(node as Record<string, unknown>)) {
      const path = prefix ? `${prefix}.${name}` : name
      if (typeof value === 'string') keys.push(path)
      else walk(value, path)
    }
  }
  walk(catalog, '')
  return keys.sort()
}

export const CATALOG_HE = he
export const CATALOG_EN = en
