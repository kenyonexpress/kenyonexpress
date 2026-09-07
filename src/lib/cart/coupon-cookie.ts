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
