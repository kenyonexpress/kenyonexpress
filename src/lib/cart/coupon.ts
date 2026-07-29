// Cart-level discount codes (`public.coupons`).
//
// NOT to be confused with the coupon *products* this shop sells, nor with
// `coupon_codes`, which are the vouchers issued after one of those is bought.
// This module is only about a code someone types into the cart to pay less.
//
// Two rules govern everything here.
//
// 1. MONEY IS AGOROT. Every amount in and out of this module is an integer
//    number of agorot. `coupons.discount_value` is the one input that is not:
//    it holds shekels for a fixed discount and a percentage for a percentage
//    one, so it is converted on the way in and never used raw.
//
// 2. NO ESCROW ON COUPON PRODUCTS. A coupon product is charged in part on the
//    site and in part at the business, and only the first part is ours to
//    discount. `balance_due_at_business` is therefore excluded from the
//    discountable base: discounting it would hand the shopper money out of the
//    supplier's till, which is not a discount, it is a transfer.

export type CouponRecord = {
  id: string
  code: string
  discount_type: string | null
  discount_value: number
  min_purchase: number | null
  expires_at: string | null
  is_active: boolean | null
  max_uses: number | null
  used_count: number | null
  product_id: string | null
}

export type CouponEvaluation =
  | { ok: true; code: string; discountAgorot: number; label: string }
  | { ok: false; reason: CouponFailure; message: string }

export type CouponFailure =
  | 'unknown'
  | 'inactive'
  | 'expired'
  | 'exhausted'
  | 'below-minimum'
  | 'not-in-cart'
  | 'nothing-to-discount'

const MESSAGES: Record<CouponFailure, string> = {
  unknown: 'קוד הקופון לא נמצא',
  inactive: 'קוד הקופון אינו פעיל',
  expired: 'תוקף קוד הקופון פג',
  exhausted: 'קוד הקופון מוצה',
  'below-minimum': 'הסכום בעגלה נמוך מהמינימום לקוד הזה',
  'not-in-cart': 'הקוד תקף למוצר שאינו בעגלה',
  'nothing-to-discount': 'אין סכום לחיוב באתר שעליו אפשר להחיל את הקוד',
}

/**
 * Codes are compared case-insensitively and without the spaces people paste
 * along with them. Stored as typed, matched as normalized: `ilike` on the
 * server does the same job in the query.
 */
export function normalizeCouponCode(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().replace(/\s+/g, '').toUpperCase() : ''
}

export type CouponCartFacts = {
  /** What the shopper pays on the site, in agorot. The discountable base. */
  payableAgorot: number
  /** Product ids in the cart, for a code tied to one product. */
  productIds: string[]
}

function fail(reason: CouponFailure): CouponEvaluation {
  return { ok: false, reason, message: MESSAGES[reason] }
}

/**
 * Decides what a code is worth against a specific cart.
 *
 * `now` is a parameter and not `new Date()` so expiry is testable and so a
 * single request evaluates every coupon against one instant.
 */
export function evaluateCoupon(
  coupon: CouponRecord | null,
  cart: CouponCartFacts,
  now: Date,
): CouponEvaluation {
  if (!coupon) return fail('unknown')
  if (coupon.is_active === false) return fail('inactive')

  if (coupon.expires_at) {
    const expires = new Date(coupon.expires_at)
    // An unparseable date is treated as expired. The alternative is honouring a
    // code whose end nobody can read.
    if (Number.isNaN(expires.getTime()) || expires.getTime() <= now.getTime()) {
      return fail('expired')
    }
  }

  if (coupon.max_uses != null && (coupon.used_count ?? 0) >= coupon.max_uses) {
    return fail('exhausted')
  }

  if (coupon.product_id && !cart.productIds.includes(coupon.product_id)) {
    return fail('not-in-cart')
  }

  if (cart.payableAgorot <= 0) return fail('nothing-to-discount')

  if (coupon.min_purchase != null) {
    const minimumAgorot = Math.round(coupon.min_purchase * 100)
    if (cart.payableAgorot < minimumAgorot) return fail('below-minimum')
  }

  const discountAgorot = discountFor(coupon, cart.payableAgorot)
  if (discountAgorot <= 0) return fail('nothing-to-discount')

  return {
    ok: true,
    code: coupon.code,
    discountAgorot,
    label: labelFor(coupon),
  }
}

/**
 * The discount, capped at the payable amount. A ₪50 code on a ₪30 cart is
 * worth ₪30, never ₪50: the difference would be a payout, and this is a
 * discount. Rounding is half-up on the agora, which is where a percentage
 * lands, and the cap is applied after rounding so the total can never go
 * negative by a single agora.
 */
function discountFor(coupon: CouponRecord, payableAgorot: number): number {
  const type = (coupon.discount_type ?? 'fixed').toLowerCase()
  const raw =
    type === 'percent' || type === 'percentage'
      ? Math.round((payableAgorot * coupon.discount_value) / 100)
      : Math.round(coupon.discount_value * 100)
  return Math.max(0, Math.min(raw, payableAgorot))
}

function labelFor(coupon: CouponRecord): string {
  const type = (coupon.discount_type ?? 'fixed').toLowerCase()
  if (type === 'percent' || type === 'percentage') return `${coupon.discount_value}% הנחה`
  return `₪${coupon.discount_value} הנחה`
}
