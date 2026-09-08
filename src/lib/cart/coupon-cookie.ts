import { isSecureProto } from '@/lib/cart/guest-session-cookie'

// The one place the cart coupon cookie is named.
//
// Lifted out of server/actions/cart.ts when /c/[code] (the printed QR landing
// route) gained a second writer. A 'use server' file may only export async
// functions, so the route could not import the constant from there, and a
// hand-copied cookie name is a bug that manifests as "the QR does nothing".
//
// The cookie holds the CODE and nothing else; every render and the charge
// itself re-evaluate it against the live cart (see the essay above
// CART_COUPON_COOKIE's original site in cart.ts).

export const CART_COUPON_COOKIE = 'ke_cart_coupon'

/** Mirrors the cart's own expiry so a stored code cannot outlive its cart. */
export const CART_EXPIRY_DAYS = 30

export const COUPON_COOKIE_MAX_AGE = CART_EXPIRY_DAYS * 24 * 60 * 60

/**
 * The options, not just the name — because the name alone was not enough.
 *
 * This cookie is written in three places: `/c/[code]` (the printed QR landing
 * route) and twice in `applyCoupon`, once for a site-wide campaign and once for
 * a `public.coupons` row. All three hand-wrote the same four attributes, all
 * three matched each other, and all three were missing `secure`.
 *
 * That is the SAME failure `guest-session-cookie.ts` was extracted for, one
 * cookie later: duplicated option literals do not look wrong when they agree
 * with each other, only when they are compared with the rest of the codebase.
 * `consent.ts`, `passkeys.ts`, the referral cookie and the guest session cookie
 * all set `secure`; this one did not, and nothing said so.
 *
 * WHAT IS ACTUALLY AT RISK, stated plainly rather than inflated. This is not a
 * session cookie. It holds a discount code that is re-evaluated against the
 * live cart on every render and again at the charge, so reading it grants no
 * discount and writing it grants no more than typing the same code into the
 * cart box. What leaks over plaintext is that this visitor scanned a
 * particular flyer, and what the flag costs is nothing.
 *
 * `secure` is conditional for the reason spelled out in
 * `guest-session-cookie.ts`: an unconditional flag is dropped by WebKit over
 * `http://localhost`, which is where the E2E suite runs, and `NODE_ENV` cannot
 * be the switch because `next start` on a laptop is already NODE_ENV=production.
 * The switch is whether THIS request arrived over TLS.
 *
 * @param proto value of `x-forwarded-proto`, or the request URL's protocol.
 */
export function couponCookieOptions(proto: string | null | undefined): {
  httpOnly: true
  sameSite: 'lax'
  maxAge: number
  path: '/'
  secure: boolean
} {
  return {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: COUPON_COOKIE_MAX_AGE,
    path: '/',
    secure: isSecureProto(proto),
  }
}
