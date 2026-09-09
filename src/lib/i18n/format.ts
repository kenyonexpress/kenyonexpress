import { DEFAULT_LOCALE, type LocaleCode, intlTag } from '@/lib/i18n/locales'
import type { Agorot } from '@/lib/money'
import { shekels, shekelsPlain } from '@/lib/money-format'

/**
 * Dates, numbers and money, formatted in one place.
 *
 * =========================================================================
 * WHY, MEASURED
 * =========================================================================
 *
 * 130 call sites reached `toLocaleDateString`, `toLocaleString` or `Intl.*`
 * directly, and 123 of them spelled `'he-IL'` inline. Every one is a place a
 * second locale would have to be found, and several already disagreed about
 * what a date looks like on this site - some pass
 * `{day:'numeric', month:'long', year:'numeric'}`, some pass nothing at all and
 * get `9.9.2026`, and the two sit on adjacent pages.
 *
 * =========================================================================
 * MONEY IS NOT REIMPLEMENTED HERE, IT IS RE-EXPORTED
 * =========================================================================
 *
 * `lib/money-format.ts` already is the one way this project renders money, and
 * its header records what it cost to get there: six functions called `shekels`
 * that disagreed about whether they took agorot or shekels, and a bidi isolate
 * arrived at by measuring five candidates in Chromium because Intl's own
 * `he-IL`/`ILS` output puts the sign on the WRONG SIDE of the digits in an RTL
 * paragraph.
 *
 * A `formatCurrency` here that called `Intl.NumberFormat` would be the seventh
 * function and would reintroduce exactly that defect, so money is re-exported
 * rather than reformatted. Agorot in, always.
 *
 * =========================================================================
 * EVERY FUNCTION TAKES A LOCALE, AND DEFAULTS TO THE ACTIVE ONE
 * =========================================================================
 *
 * So a call site reads the same as it did before the parameter existed, and the
 * one that eventually needs to vary has somewhere to say so. The default is a
 * parameter default rather than a module constant, so a test can pass `'en'`
 * without any global state to reset.
 */

export type { LocaleCode }

/** Money. See the header: agorot in, and never reformatted here. */
export { shekels as formatCurrency, shekelsPlain as formatCurrencyPlain }
export type { Agorot }

/**
 * The site's date format: `9 בספטמבר 2026`.
 *
 * Long month rather than numeric, because `9.9.2026` and `9/9/2026` are the
 * same string to an Israeli and an American reader and mean different days,
 * and this is what `/about`, `/faq` and the legal pages already print.
 */
export function formatDate(
  value: Date | string | number,
  locale: LocaleCode = DEFAULT_LOCALE,
): string {
  const date = toDate(value)
  if (!date) return ''
  return date.toLocaleDateString(intlTag(locale), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/** `9.9.2026`, for a table where the long form would not fit. */
export function formatDateShort(
  value: Date | string | number,
  locale: LocaleCode = DEFAULT_LOCALE,
): string {
  const date = toDate(value)
  if (!date) return ''
  return date.toLocaleDateString(intlTag(locale), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

/** Date and time, for an order or an audit row. */
export function formatDateTime(
  value: Date | string | number,
  locale: LocaleCode = DEFAULT_LOCALE,
): string {
  const date = toDate(value)
  if (!date) return ''
  return date.toLocaleString(intlTag(locale), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Just the clock, for a countdown or a delivery window. */
export function formatTime(
  value: Date | string | number,
  locale: LocaleCode = DEFAULT_LOCALE,
): string {
  const date = toDate(value)
  if (!date) return ''
  return date.toLocaleTimeString(intlTag(locale), { hour: '2-digit', minute: '2-digit' })
}

/**
 * A plain integer or decimal, grouped.
 *
 * NOT for money. `formatCurrency` exists and money is agorot; passing a shekel
 * float here is the 100x error `money-format.ts` was written to end.
 */
export function formatNumber(
  value: number,
  locale: LocaleCode = DEFAULT_LOCALE,
  options: Intl.NumberFormatOptions = {},
): string {
  if (!Number.isFinite(value)) return ''
  return value.toLocaleString(intlTag(locale), { useGrouping: true, ...options })
}

/** `12%`. The value is a PERCENTAGE, not a fraction: 12 means 12%. */
export function formatPercent(
  value: number,
  locale: LocaleCode = DEFAULT_LOCALE,
  fractionDigits = 0,
): string {
  if (!Number.isFinite(value)) return ''
  return `${value.toLocaleString(intlTag(locale), {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })}%`
}

/**
 * "לפני 3 ימים", "בעוד שעתיים".
 *
 * `now` is a parameter with no default, deliberately. Reading the clock inside
 * a function called from a Server Component is a build error under
 * `cacheComponents` - the wall `lib/homepage/cms.ts` hit and documented at
 * length - so the caller that has a clock supplies one, and the ones that
 * cannot are forced to notice.
 */
export function formatRelativeTime(
  value: Date | string | number,
  now: Date,
  locale: LocaleCode = DEFAULT_LOCALE,
): string {
  const date = toDate(value)
  if (!date) return ''

  const seconds = Math.round((date.getTime() - now.getTime()) / 1000)
  const absolute = Math.abs(seconds)
  const formatter = new Intl.RelativeTimeFormat(intlTag(locale), { numeric: 'auto' })

  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['week', 604_800],
    ['day', 86_400],
    ['hour', 3600],
    ['minute', 60],
  ]
  for (const [unit, size] of units) {
    if (absolute >= size) return formatter.format(Math.round(seconds / size), unit)
  }
  return formatter.format(seconds, 'second')
}

/**
 * Anything a date can arrive as, or null.
 *
 * An invalid date returns null and every caller renders the empty string rather
 * than `Invalid Date`, which is the string this codebase would otherwise print
 * into a receipt: `new Date(undefined as never).toLocaleDateString()` does not
 * throw, it returns those two words.
 */
function toDate(value: Date | string | number): Date | null {
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}
