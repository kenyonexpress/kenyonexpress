/**
 * The stated basis of a struck-through "regular price", as the page shows it.
 *
 * `products.original_price_source` (pending 242) is a short label the operator
 * types -- "מחירון היצרן", "מחיר באתר הספק" -- and
 * `products.original_price_source_url` is an optional link to the evidence.
 * This module turns the two raw columns into what a surface may render, and
 * it is pure so the product page, the coupon block and the tests agree.
 *
 * WHAT IT DOES NOT DECIDE. Whether the strike itself may be shown is the
 * 30-day verdict in `reference-price.ts`. A source is a claim ABOUT the claim;
 * it never makes a suppressed price reappear, and a surface must only render
 * it next to a strike that is already permitted.
 *
 * A URL WITHOUT A LABEL RENDERS NOTHING. The label is the sentence the shopper
 * reads; a bare link with no words is not a stated basis. A label without a
 * URL is fine and is the common case (a manufacturer's printed price list).
 */

export interface OriginalPriceSource {
  /** Trimmed label, 2..120 characters, the same bound as the CHECK in 242. */
  label: string
  /** An https URL that parsed, or null. Never http, never javascript:. */
  href: string | null
}

const MAX_LABEL = 120

function httpsOrNull(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const text = raw.trim()
  if (!text) return null
  try {
    const url = new URL(text)
    return url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

export function describeOriginalPriceSource(input: {
  label: unknown
  url?: unknown
}): OriginalPriceSource | null {
  if (typeof input.label !== 'string') return null
  const label = input.label.trim()
  if (label.length < 2 || label.length > MAX_LABEL) return null
  return { label, href: httpsOrNull(input.url) }
}

/**
 * Hosts Google publishes a business's reviews under. The database CHECK in
 * 242 allows the same set; this is the client-side twin so a row written
 * before the constraint (or by hand) still cannot put a foreign link under
 * the words "ביקורות בגוגל".
 */
// `google\.[a-z]{2,3}(\.[a-z]{2})?` and not `google\.[a-z.]+`: the looser form
// also matched `google.com.evil.io`, because a dot inside the class lets the
// "TLD" run on through any number of further labels. The tight form covers
// google.com, google.co.il, google.de and google.com.au and nothing past them.
const GOOGLE_HOST = /^([a-z0-9-]+\.)*(google\.[a-z]{2,3}(\.[a-z]{2})?|goo\.gl|g\.page)$/i

export function googleReviewsHref(raw: unknown): string | null {
  const href = httpsOrNull(raw)
  if (!href) return null
  const host = new URL(href).hostname
  return GOOGLE_HOST.test(host) ? href : null
}
