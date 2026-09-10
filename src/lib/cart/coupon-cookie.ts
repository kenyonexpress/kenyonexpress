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
 * Since stacking (see lib/growth/stacking.ts) the cookie can hold up to
 * MAX_STACKED_CODES campaign codes, separator '|' (a character
 * normalizeCouponCode can never emit, so an old single-code cookie parses as a
 * one-element list and nothing else changes). The cookie still holds CODES and
 * nothing else; every render re-resolves and re-prices them.
 */
export const COUPON_STACK_SEPARATOR = '|'

export function parseCouponCookieCodes(value: string | undefined): string[] {
  if (!value) return []
  const seen = new Set<string>()
  for (const part of value.split(COUPON_STACK_SEPARATOR)) {
    const code = part.trim().replace(/\s+/g, '').toUpperCase()
    if (code) seen.add(code)
  }
  return [...seen]
}

export function serializeCouponCookieCodes(codes: string[]): string {
  return codes.join(COUPON_STACK_SEPARATOR)
}
