/**
 * The product page's buy-row wording per arm of the `cta_copy` experiment
 * (lib/analytics/experiments.ts). A plain module, not a client one: a value
 * exported from a 'use client' file is a proxy on the server, and the page
 * is server-rendered in control before the browser decides anything.
 *
 * Control is the live site's wording, copied not corrected. `invite` is the
 * same three buttons in the plural, naming what the shopper gets. Nothing
 * else differs between the arms: order, handlers, price and disabled states
 * are identical, so a lift here is a lift of the words alone.
 */

import type { CtaCopyVariant } from '@/lib/analytics/experiments'

export type CtaCopy = {
  /** The add-to-cart button for a stocked, non-coupon product. */
  addToCart: string
  /** The same button when the product is a coupon (one tap buys it). */
  buyCoupon: string
  /** The "buy now" button under the row. */
  buyNow: string
}

export const CTA_COPY: Readonly<Record<CtaCopyVariant, CtaCopy>> = {
  control: { addToCart: 'הוסף לסל', buyCoupon: 'קנה עכשיו', buyNow: 'קנה עכשיו' },
  invite: { addToCart: 'הוסיפו לסל', buyCoupon: 'קבלו את הקופון', buyNow: 'קנו עכשיו' },
}

export function ctaCopy(variant: CtaCopyVariant): CtaCopy {
  return CTA_COPY[variant] ?? CTA_COPY.control
}
