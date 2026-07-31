import { type Agorot, agorot } from '@/lib/money'

export type CartStorageItem = {
  product_id: string
  variant_id: string | null
  quantity: number
  /**
   * The product's `platform_percent` as it stood when this line was added, kept
   * as a whole percent (the unit the catalogue stores it in).
   *
   * Written by the server from a fresh read of the product row. NEVER accepted
   * from the browser: the cart lives in a row the guest's own session owns, so
   * a client-supplied percent would be a self-served commission rate.
   *
   * It is a snapshot for display and audit, not an authority over the charge.
   * Nothing the customer pays is derived from it (a physical line charges face
   * value, a coupon charges its absolute admin-set price), so a stale snapshot
   * can move the internal split on screen and can never move the total.
   * Checkout re-reads the live percent regardless.
   */
  platform_percent_snapshot?: number | null
}

export type CartViewItem = {
  product_id: string
  variant_id: string | null
  quantity: number
  name_he: string
  slug: string
  image_url: string | null
  /** Integer agorot. Every money field on this type is agorot, never shekels. */
  unit_price: Agorot
  line_total: Agorot
  type: 'physical' | 'coupon'
  available: boolean
  platform_fee: Agorot
  supplier_due: Agorot
  customer_pays_now: Agorot
  balance_due_at_business: Agorot
  /**
   * The rate that actually priced this line, in basis points, as the settlement
   * engine reported it. On a coupon this is 10000: the platform keeps the whole
   * prepayment, so reporting the product's configured percent here would
   * describe a split that did not happen.
   */
  platform_percent_bp: number
  /**
   * What the product's `platform_percent` was when the line was added, in whole
   * percent, or null for a line added before snapshots existed. Kept beside
   * `platform_percent_bp` rather than merged into it because the two answer
   * different questions: this is what the catalogue said then, that is what the
   * money engine did now.
   */
  platform_percent_snapshot: number | null
  /** Coupon lines only: the admin-set absolute on-site price per unit, agorot. */
  coupon_price_unit: Agorot | null
}

/**
 * A discount code the shopper has applied, as the cart renders it.
 *
 * Only ever produced by the server from a fresh read of `public.coupons`. The
 * browser holds the code string and nothing else: the amount is recomputed on
 * every cart render, so a stale or edited cookie can widen nothing.
 */
export type AppliedCoupon = {
  code: string
  label: string
  /** Integer agorot, like every other money field on this view. */
  discount: Agorot
}

export type CartView = {
  id: string | null
  items: CartViewItem[]
  item_count: number
  /** Integer agorot. */
  subtotal: Agorot
  platform_fee: Agorot
  supplier_due: Agorot
  balance_due_at_business: Agorot
  /** Null when no code is applied, or when the applied one stopped being valid. */
  coupon: AppliedCoupon | null
  /** Agorot off the on-site charge. Zero without a valid coupon. */
  discount: Agorot
  /** What the card is actually charged: subtotal - discount, never below zero. */
  total: Agorot
}

const ZERO = agorot(0)

export const EMPTY_CART: CartView = {
  id: null,
  items: [],
  item_count: 0,
  subtotal: ZERO,
  platform_fee: ZERO,
  supplier_due: ZERO,
  balance_due_at_business: ZERO,
  coupon: null,
  discount: ZERO,
  total: ZERO,
}

export type CartActionResult =
  | { ok: true; cart: CartView }
  | { ok: false; error: string; code: string }
