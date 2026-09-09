/**
 * The locales this application knows about, and which of them is switched on.
 *
 * =========================================================================
 * WHAT WAS HERE BEFORE, MEASURED
 * =========================================================================
 *
 * `next-intl` is a dependency, `next.config.ts` wires its plugin,
 * `src/i18n/routing.ts` declared `locales: ['he', 'en']`, and `messages/he.json`
 * and `messages/en.json` both exist. NOT ONE COMPONENT CALLED ANY OF IT: zero
 * `useTranslations`, zero `getTranslations`, no `NextIntlClientProvider`, and no
 * `middleware.ts` at all - so `localePrefix: 'as-needed'` routed nothing and
 * `/en/anything` was a 404. The whole stack was scaffolding nothing called,
 * which is the same shape as `homepage_sections` in [59] and
 * `email_suppressions` in [60].
 *
 * The declaration was also a promise nothing kept. `en` being listed as a
 * locale said "English works here", and it did not: the catalog held about
 * forty keys against 1,292 rendered Hebrew strings, and nothing read either.
 *
 * =========================================================================
 * SO `en` IS `prepared`, NOT `active`
 * =========================================================================
 *
 * [61] asks for "locale routing prepared but only he-IL active", and the
 * distinction is what this file exists to make explicit rather than to imply
 * from an array. An ACTIVE locale is one a visitor can reach and that has a
 * complete catalog. A PREPARED locale is one the code is shaped for: it has a
 * direction, a date format and a catalog with the same keys, and it is used by
 * the tests that prove the layout switches - and it is not routed.
 *
 * `en` is the DUMMY LOCALE [61] asks for. It exists so `dir` flipping to `ltr`
 * is exercised by something rather than asserted about, and its catalog is kept
 * key-for-key with Hebrew's by `messages.test.ts`. Turning it on is adding it to
 * `ACTIVE_LOCALES` and writing a middleware; nothing else in this file changes.
 */

export type LocaleDirection = 'rtl' | 'ltr'

export interface LocaleDefinition {
  /** BCP 47, as `<html lang>` takes it. */
  code: string
  /** The regional tag `Intl` is given. `he` alone formats dates as en-US would. */
  intlTag: string
  dir: LocaleDirection
  /** Its own name in its own language, for a switcher that does not yet exist. */
  nativeName: string
}

export const LOCALES = {
  he: { code: 'he', intlTag: 'he-IL', dir: 'rtl', nativeName: 'עברית' },
  en: { code: 'en', intlTag: 'en-GB', dir: 'ltr', nativeName: 'English' },
} as const satisfies Record<string, LocaleDefinition>

export type LocaleCode = keyof typeof LOCALES

/**
 * The one locale a visitor can reach.
 *
 * A list of one rather than a constant, because every consumer that iterates it
 * - the `<link rel="alternate">` set, a future switcher, the sitemap - is then
 * already correct on the day a second locale is added, and none of them has to
 * be found.
 */
export const ACTIVE_LOCALES: readonly LocaleCode[] = ['he']

export const DEFAULT_LOCALE: LocaleCode = 'he'

/** Declared and shaped for, and not reachable. See the header. */
export const PREPARED_LOCALES: readonly LocaleCode[] = (
  Object.keys(LOCALES) as LocaleCode[]
).filter((code) => !ACTIVE_LOCALES.includes(code))

export function isLocaleCode(value: string): value is LocaleCode {
  return Object.hasOwn(LOCALES, value)
}

export function isActiveLocale(value: string): boolean {
  return isLocaleCode(value) && ACTIVE_LOCALES.includes(value)
}

/**
 * A locale's writing direction.
 *
 * Unknown falls back to the default locale's direction rather than to `ltr`.
 * The default here is `rtl`, and an unknown code arriving at a Hebrew site is
 * far more likely to be a typo in a Hebrew route than a genuine English
 * request; guessing `ltr` would mirror the whole page for that mistake.
 */
export function localeDirection(value: string): LocaleDirection {
  return isLocaleCode(value) ? LOCALES[value].dir : LOCALES[DEFAULT_LOCALE].dir
}

/** The tag `Intl` is given. See `intlTag` on why it is not the bare code. */
export function intlTag(value: string): string {
  return isLocaleCode(value) ? LOCALES[value].intlTag : LOCALES[DEFAULT_LOCALE].intlTag
}
