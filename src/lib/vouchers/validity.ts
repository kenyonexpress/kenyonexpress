/**
 * Coupon validity, per product: 30, 60 or 90 days. Default 90.
 *
 * The owner's rule (S10, 2026-11-04), and it replaces CONTRADICTIONS C7, which
 * refused to issue a voucher for a product with no validity set. That refusal
 * took the payment and then produced nothing until an admin noticed, on 88 of
 * 126 products. The database carries the same rule since 254:
 * `products.coupon_expiry_days` DEFAULT 90, CHECK IN (30, 60, 90). NULL stays
 * legal in the column because a physical product has no validity at all; for a
 * coupon this module reads NULL as the default.
 */

export const COUPON_VALIDITY_DAYS = [30, 60, 90] as const

export type CouponValidityDays = (typeof COUPON_VALIDITY_DAYS)[number]

export const DEFAULT_COUPON_VALIDITY_DAYS: CouponValidityDays = 90

export function isCouponValidityDays(value: unknown): value is CouponValidityDays {
  return (COUPON_VALIDITY_DAYS as readonly unknown[]).includes(value)
}

export class CouponValidityError extends Error {
  constructor(value: unknown) {
    super(`coupon validity must be 30, 60 or 90 days, got ${String(value)}`)
    this.name = 'CouponValidityError'
  }
}

/**
 * NULL, undefined and the empty string are the default. Anything else must be
 * one of the three values, as a number or a numeric string. A value outside
 * them throws instead of rounding to the nearest: 45 days is a promise someone
 * typed, and silently turning it into 30 or 60 changes when the customer's
 * coupon dies.
 */
export function resolveCouponValidityDays(value: unknown): CouponValidityDays {
  if (value === null || value === undefined || value === '') return DEFAULT_COUPON_VALIDITY_DAYS
  const days = typeof value === 'string' ? Number(value.trim()) : value
  if (isCouponValidityDays(days)) return days
  throw new CouponValidityError(value)
}
