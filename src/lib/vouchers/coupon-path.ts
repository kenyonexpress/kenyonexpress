/**
 * One path prefix, two pages.
 *
 * `/coupon/<uuid>` is a customer's own voucher: the code and the signed QR a
 * cashier scans. It needs a session, it is noindex, and robots.txt refuses
 * the whole prefix for it. `/coupon/<slug>` is the public coupon variant of a
 * product page: what the deal is, what the voucher will look like, where the
 * business is. Same prefix, because a printed flyer and an email both say
 * "kenyonexpress.co.il/coupon/..." and a second spelling would be a second
 * thing to get wrong.
 *
 * The split is decided by SHAPE and nowhere else. A voucher id is a UUID from
 * `vouchers.id`; a product slug is `slugify(name_he)` and cannot be one: the
 * catalogue importer never emits a bare 8-4-4-4-12 hex string, and a product
 * whose admin typed one by hand would be reachable from nothing else either.
 * Both the proxy and the route call this, so the guard that redirects to
 * login and the page that renders the voucher cannot disagree about which
 * half a path belongs to.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** True when the segment is a voucher id, false when it is a product slug. */
export function isVoucherId(segment: string): boolean {
  return UUID_PATTERN.test(segment)
}

/**
 * The first path segment after `/coupon/`, decoded, or null off the prefix.
 * Hebrew slugs arrive percent-encoded from the browser and raw from Next's
 * `params`; both spellings must land on the same answer.
 */
export function couponPathSegment(pathname: string): string | null {
  if (!pathname.startsWith('/coupon/')) return null
  const rest = pathname.slice('/coupon/'.length).split('/')[0] ?? ''
  if (!rest) return null
  try {
    return decodeURIComponent(rest)
  } catch {
    return rest
  }
}

/**
 * Whether the proxy must have a session before serving this path.
 *
 * Only the voucher half. A shopper reading a public coupon page is exactly the
 * person who has not bought yet, and bouncing them to a login form is how the
 * old blanket `startsWith('/coupon/')` would have answered every link the
 * similar-coupons strip renders.
 */
export function couponPathNeedsSession(pathname: string): boolean {
  const segment = couponPathSegment(pathname)
  return segment !== null && isVoucherId(segment)
}
