import { ACTIVE_LOCALES, DEFAULT_LOCALE, PREPARED_LOCALES } from '@/lib/i18n/locales'
import { defineRouting } from 'next-intl/routing'

/**
 * next-intl's routing, declared from the ONE list of locales.
 *
 * IT DECLARED `['he', 'en']` AND ROUTED NEITHER. There is no `middleware.ts` in
 * this repository, so `localePrefix: 'as-needed'` prefixed nothing and
 * `/en/anything` was a 404. Declaring `en` said "English works here", and the
 * catalog held about forty keys against 1,292 rendered Hebrew strings, none of
 * which anything read.
 *
 * [61] asks for routing "prepared but only he-IL active", so `locales` is now
 * `ACTIVE_LOCALES` and `en` moved to `PREPARED_LOCALES`: shaped for, tested
 * against, and not reachable. `lib/i18n/locales.ts` is where that distinction
 * lives and `locales.test.ts` asserts exactly one locale is active, so turning
 * English on is a deliberate one-line change that fails a test until somebody
 * updates it.
 *
 * `PREPARED_LOCALES` is imported and not used on purpose - see the assertion
 * below. It is what keeps this file from being read as "English was forgotten".
 */

/** Names the prepared set so a reader knows the omission is deliberate. */
void PREPARED_LOCALES

export const routing = defineRouting({
  locales: ACTIVE_LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  // `as-needed`, so the one active locale keeps its bare paths: `/about` and
  // not `/he/about`. Every URL already indexed stays what it is, which is the
  // whole reason this is not `always`.
  localePrefix: 'as-needed',
})
