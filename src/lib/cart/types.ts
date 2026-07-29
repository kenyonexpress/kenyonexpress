export type CartStorageItem = {
  product_id: string
  variant_id: string | null
  quantity: number
}

export type CartViewItem = {
  product_id: string
  variant_id: string | null
  quantity: number
  name_he: string
  slug: string
  image_url: string | null
  unit_price: number
  line_total: number
  type: 'physical' | 'coupon'
  available: boolean
  platform_fee: number
  supplier_due: number
  customer_pays_now: number
  balance_due_at_business: number
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
  /** Shekels, like every other money field on this view. */
  discount: number
}

export type CartView = {
  id: string | null
  items: CartViewItem[]
  item_count: number
  subtotal: number
  platform_fee: number
  supplier_due: number
  balance_due_at_business: number
  /** Null when no code is applied, or when the applied one stopped being valid. */
  coupon: AppliedCoupon | null
  /** Shekels off the on-site charge. Zero without a valid coupon. */
  discount: number
  /** What the card is actually charged: subtotal - discount, never below zero. */
  total: number
}

export const EMPTY_CART: CartView = {
  id: null,
  items: [],
  item_count: 0,
  subtotal: 0,
  platform_fee: 0,
  supplier_due: 0,
  balance_due_at_business: 0,
  coupon: null,
  discount: 0,
  total: 0,
}

export type CartActionResult =
  | { ok: true; cart: CartView }
  | { ok: false; error: string; code: string }
