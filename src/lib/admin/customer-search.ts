import { normalizeIsraeliPhone } from '@/lib/whatsapp'

/**
 * What the person on the phone just read out, classified before it becomes a query.
 *
 * =========================================================================
 * WHY A CLASSIFIER AND NOT ONE `ilike` OVER THREE COLUMNS
 * =========================================================================
 *
 * `/admin/users?q=` already existed and searched `full_name` and `email`. The
 * section asks for lookup by email OR PHONE OR ORDER ID, and neither of the
 * two missing ones is a column on `profiles` that a wider `.or()` would reach:
 *
 *   - The phone the customer gives support is the one they typed at checkout,
 *     which lands in `user_addresses.phone`. Measured on production
 *     2026-09-10: **0 of 10 `profiles` rows carry a phone at all**, and the one
 *     address row that exists does. A phone search against `profiles` would
 *     have been a field that matches nothing, forever, with no error.
 *
 *   - An "order id" is not one string. What the customer HAS is whatever the
 *     confirmation mail printed, and that is `id.slice(0, 8).toUpperCase()` --
 *     the `order_ref` in `finalize.ts`, `invoices.ts`, `shipped-notice.ts` and
 *     the WhatsApp templates. They do not have the UUID and, measured today,
 *     they do not have an invoice number either: **0 of 4 orders carry one**.
 *
 * So a term has to be READ before it is looked up, and the reading is pure so
 * it can be tested without a database.
 *
 * =========================================================================
 * THE ORDER OF THE TESTS IS THE DESIGN
 * =========================================================================
 *
 * `8f3a1c2b` is a valid order ref AND a plausible fragment of a name, and
 * `972501234567` is a phone AND a number somebody could paste into any field.
 * Every classification is therefore a NARROWING, never an exclusion: the caller
 * runs the narrow query and, when it returns nothing, falls back to the name
 * search. That is why `fallbackToName` exists on the result instead of the
 * classifier trying to be certain.
 */

export type CustomerSearchKind = 'empty' | 'uuid' | 'order_ref' | 'email' | 'phone' | 'name'

export interface CustomerSearchTerm {
  kind: CustomerSearchKind
  /** The cleaned form the query should use. Empty string when `kind` is `empty`. */
  value: string
  /**
   * The raw term, trimmed. Kept because `order_ref` and `phone` both narrow to
   * something that is not what the operator typed, and a "no results for X"
   * message has to say X.
   */
  raw: string
  /**
   * True when this classification is a guess that a name search could also
   * satisfy. The caller runs the narrow query first and only widens on zero
   * rows, so a customer literally named after their own order ref is still
   * findable.
   */
  fallbackToName: boolean
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** The eight hex characters the confirmation email prints. Case is irrelevant. */
const ORDER_REF = /^[0-9a-f]{8}$/i

export function classifyCustomerTerm(raw: string | null | undefined): CustomerSearchTerm {
  const term = (raw ?? '').trim()
  if (!term) return { kind: 'empty', value: '', raw: '', fallbackToName: false }

  if (UUID.test(term)) {
    return { kind: 'uuid', value: term.toLowerCase(), raw: term, fallbackToName: false }
  }

  // An `@` is the one unambiguous signal here: no Israeli phone and no order
  // ref contains one, and a person is not named with one.
  if (term.includes('@')) {
    return { kind: 'email', value: term.toLowerCase(), raw: term, fallbackToName: false }
  }

  if (ORDER_REF.test(term)) {
    // `fallbackToName` is true and it matters: `deadbeef` is eight hex
    // characters and is also a word somebody could have in a display name.
    return { kind: 'order_ref', value: term.toLowerCase(), raw: term, fallbackToName: true }
  }

  // Only attempted when the term is phone-SHAPED. `normalizeIsraeliPhone`
  // strips every non-digit, so without this guard the name "05" typed into the
  // box would be normalised into somebody's number.
  if (/^[\d\s+()-]+$/.test(term)) {
    const intl = normalizeIsraeliPhone(term)
    if (intl) return { kind: 'phone', value: intl, raw: term, fallbackToName: false }
  }

  return { kind: 'name', value: term, raw: term, fallbackToName: false }
}

/**
 * The spellings of one number that might actually be sitting in the column.
 *
 * `user_addresses.phone` is free text: nothing normalises it on the way in, so
 * the same customer is `050-123-4567` on one address and `+972501234567` on the
 * next. Measured on production 2026-09-10 the single stored phone carries no
 * separators at all, which is exactly the sample size that would make a
 * separator-blind matcher look correct.
 *
 * Returned INDEXABLE FIRST. The four exact forms are equality-shaped and are
 * what a `.in()` can use; `loosePattern` below is the scan, and the caller only
 * pays for it when the exact forms found nobody.
 */
export function phoneExactVariants(intl: string): string[] {
  const national = intl.replace(/^972/, '')
  return [`0${national}`, intl, `+${intl}`, national]
}

/**
 * The separator-blind fallback: every digit, with `%` between them.
 *
 * `050-123-4567`, `050 123 4567` and `(050) 123-4567` are one number written
 * three ways, and no list of exact variants covers a form nobody thought of.
 * `0%5%0%1%2%3%4%5%6%7` matches all three and cannot miss a fourth.
 *
 * IT IS A SEQUENTIAL SCAN AND THAT IS ACCEPTED, because it runs only after the
 * exact forms returned zero rows and because a support lookup is one operator
 * pressing one button, not a page render. The false positives it can produce
 * (a longer number that contains this one's digits in order) land in front of a
 * human who is already reading the row.
 */
export function phoneLoosePattern(intl: string): string {
  const national = intl.replace(/^972/, '')
  return `%${`0${national}`.split('').join('%')}%`
}
