import { CART_EXPIRY_DAYS } from '@/lib/cart/coupon-cookie'

/**
 * The one place the cart shipping-method cookie is named.
 *
 * Same contract as the coupon cookie beside it: the cookie holds a METHOD ID
 * and nothing else. The label and the rate are re-read from the registry in
 * `lib/shipping/methods.ts` on every cart render and again at checkout, so an
 * edited cookie can pick a different method and never a different price, and
 * a value the registry no longer knows resolves to the default.
 *
 * Kept outside `server/actions/cart.ts` for the same reason the coupon cookie
 * moved: a 'use server' module may only export async functions.
 */
export const CART_SHIPPING_COOKIE = 'ke_cart_shipping'

/** Mirrors the cart's own expiry so a stored choice cannot outlive its cart. */
export const SHIPPING_COOKIE_MAX_AGE = CART_EXPIRY_DAYS * 24 * 60 * 60
