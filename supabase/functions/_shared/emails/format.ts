/**
 * Hebrew presentation for the email templates.
 *
 * Pure and dependency-free so it runs unchanged in Deno (the Edge Functions)
 * and in Node (the vitest suite). It is a deliberate second copy of the four
 * formatters in `src/lib/vouchers/coupon-view.ts` and not an import of them:
 * that module is inside the Next app, resolves through the `@/` alias, and
 * pulls in the rest of the coupon view. An Edge Function bundle cannot reach
 * it. The behaviour is pinned instead — `src/lib/notifications/emails.test.tsx`
 * asserts these agree with the originals character for character, so a change
 * to one that is not made to the other fails CI rather than drifting quietly.
 *
 * MONEY IS ALWAYS AGOROT, ALWAYS AN INTEGER. Nothing here computes; the only
 * division by 100 in this file is the last step before a string, which is the
 * same place `formatAgorot` does it today. No template ever receives shekels.
 */

/** `₪22.00`, Hebrew grouping. `—` for anything unusable, never `₪NaN`. */
export function formatAgorot(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return `₪${(value / 100).toLocaleString('he-IL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

/** `ABCDE-FGHIJ`. A code is read aloud at a counter; five is what fits an eye. */
export function formatCouponCode(code: string): string {
  const clean = code.replace(/[^0-9A-Za-z]/g, '').toUpperCase()
  const groups: string[] = []
  for (let i = 0; i < clean.length; i += 5) groups.push(clean.slice(i, i + 5))
  return groups.join('-')
}

/** `3 בספטמבר 2026`. `—` for a missing or unparseable date. */
export function formatCouponDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })
}

/**
 * A Hebrew plural for whole days.
 *
 * `יום אחד` and not `1 ימים`. The reminder that matters most is the last one,
 * and it is the one the naive template gets wrong.
 */
export function formatDaysRemaining(days: number): string {
  if (!Number.isFinite(days) || days < 0) return ''
  if (days === 0) return 'היום'
  if (days === 1) return 'מחר'
  if (days === 2) return 'בעוד יומיים'
  return `בעוד ${days} ימים`
}

/**
 * A postal address on one line, in the order an Israeli courier reads it.
 *
 * Every part is optional because `user_addresses` allows most of them to be
 * null, and a template that interpolates them blindly prints `רחוב null`. The
 * empty string is a valid answer and the caller renders nothing for it.
 */
export interface PostalAddress {
  street?: string | null
  streetNumber?: string | null
  apartment?: string | null
  entrance?: string | null
  floor?: string | null
  city?: string | null
  zip?: string | null
}

export function formatAddress(address: PostalAddress | null | undefined): string {
  if (!address) return ''
  const street = [address.street, address.streetNumber].filter(Boolean).join(' ').trim()
  const inside = [
    address.entrance ? `כניסה ${address.entrance}` : null,
    address.floor ? `קומה ${address.floor}` : null,
    address.apartment ? `דירה ${address.apartment}` : null,
  ]
    .filter(Boolean)
    .join(', ')

  return [street, inside, address.city, address.zip]
    .map((part) => (part ?? '').trim())
    .filter((part) => part.length > 0)
    .join(', ')
}

/** Origin with no trailing slash, so `${site}/coupon/x` never doubles a slash. */
export function siteOrigin(url: string): string {
  return url.replace(/\/+$/, '')
}

export function couponUrl(site: string, voucherId: string): string {
  return `${siteOrigin(site)}/coupon/${encodeURIComponent(voucherId)}`
}
