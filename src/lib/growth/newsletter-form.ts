/**
 * The newsletter address check and the words it answers with (UX12).
 *
 * ONE MODULE, TWO CALLERS, ONE SET OF WORDS. `useNewsletterForm` runs this in
 * the browser before a submit leaves the page, and `subscribeToNewsletter`
 * runs it again on the server, so a visitor with scripts off and a visitor
 * with them on read the same Hebrew sentence for the same mistake. Before
 * UX12 the browser answered an empty field in its own locale ("Please fill
 * out this field." in a headless Chromium, measured 14.10 at all three
 * widths) and let `ofir@kenyon` through its `type="email"` check to a server
 * round trip that answered "כתובת מייל לא תקינה" and kept saying it after the
 * visitor had fixed the typing.
 *
 * A PLAIN MODULE ON PURPOSE. Nothing here is `'use client'` or `'use server'`:
 * a `'use server'` file may export only async functions, and a value read
 * from a `'use client'` file is a proxy on the server, so the shared words
 * live in neither.
 *
 * The shape check is deliberately looser than RFC 5322 and stricter than the
 * browser's: something before the @, something after it, and a dot followed
 * by at least two characters, because the double opt-in mail is what decides
 * whether an address is real and the form only has to stop the slips a
 * person can see and fix.
 */

/** RFC 5321's path limit; the column is sized to it. */
export const NEWSLETTER_EMAIL_MAX = 254

export const NEWSLETTER_FIELD_COPY = {
  empty: 'נא להזין כתובת מייל',
  noAt: 'כתובת המייל חייבת לכלול @',
  invalid: 'כתובת המייל לא תקינה, למשל name@gmail.com',
  tooLong: 'כתובת המייל ארוכה מדי',
} as const

export const NEWSLETTER_FORM_COPY = {
  pending: 'שולח...',
  successTitle: 'בדקו את תיבת המייל',
  successHint: 'לא הגיע תוך כמה דקות? כדאי לבדוק גם בתיקיית הספאם.',
  sentTo: 'שלחנו קישור לאישור אל',
} as const

export type NewsletterFieldCheck =
  | { ok: true; email: string }
  | { ok: false; error: (typeof NEWSLETTER_FIELD_COPY)[keyof typeof NEWSLETTER_FIELD_COPY] }

/** Local part, then dot-separated domain labels with no empty label and a final label of two or more. */
const SHAPE = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)*\.[^\s@.]{2,}$/

/**
 * Trims, lower-cases and checks one typed address. The `email` on a passing
 * result is the normalised form the server stores and the client echoes back.
 */
export function checkNewsletterEmail(raw: unknown): NewsletterFieldCheck {
  const value = typeof raw === 'string' ? raw.trim() : ''
  if (value === '') return { ok: false, error: NEWSLETTER_FIELD_COPY.empty }
  if (value.length > NEWSLETTER_EMAIL_MAX)
    return { ok: false, error: NEWSLETTER_FIELD_COPY.tooLong }
  if (!value.includes('@')) return { ok: false, error: NEWSLETTER_FIELD_COPY.noAt }
  if (!SHAPE.test(value)) return { ok: false, error: NEWSLETTER_FIELD_COPY.invalid }
  return { ok: true, email: value.toLowerCase() }
}
