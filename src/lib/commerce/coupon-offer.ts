/**
 * What a coupon product offers the customer, derived once so the product page,
 * the card and the tests all read the same numbers.
 *
 * The model is the one settled on 2026-07-24 and implemented in
 * `lib/commerce/commission.ts`: the customer pays an ABSOLUTE amount online
 * (`products.coupon_price_ils`, set per product by the admin) and settles the
 * remainder with the business at redemption. It is deliberately NOT a percent.
 *
 * This module exists because the storefront had drifted off that model: the
 * product page rendered `price * 0.1` with the copy "שלם 10% עכשיו (10%) ואת
 * השאר בחנות", and the card said "שלם 10% עכשיו, 90% בבית העסק". The cart and
 * the money engine were already correct, so a customer was quoted one number
 * on the page and charged a different one at checkout. Deriving the display
 * from the same column the engine bills from is what stops that recurring.
 */

/** A coupon whose admin-set price is missing cannot be sold, only described. */
export type CouponOffer =
  | {
      sellable: false
      /** Why the offer cannot be sold, for the page to explain rather than guess. */
      reason: 'missing-price' | 'expired'
      fullPriceIls: number
      validUntil: Date | null
    }
  | {
      sellable: true
      /** Sticker price of the goods; what the business would charge without a coupon. */
      fullPriceIls: number
      /** Paid on this site, now. The absolute admin-set amount. */
      paidOnlineIls: number
      /** Settled with the business at redemption. Never negative. */
      balanceAtBusinessIls: number
      /** Whole-percent saving off the sticker price, for the badge. */
      discountPercent: number
      /** Calendar deadline of the offer itself, if the admin set one. */
      validUntil: Date | null
      /** Days the issued voucher stays valid from purchase, if capped. */
      expiryDays: number | null
    }

export interface CouponOfferInput {
  /** products.price_ils — the sticker price. */
  fullPriceIls: number | null | undefined
  /** products.coupon_price_ils — the absolute online charge. No default exists. */
  couponPriceIls: number | null | undefined
  /** products.offer_valid_until */
  validUntil: string | Date | null | undefined
  /** products.coupon_expiry_days */
  expiryDays: number | null | undefined
  /** Injected so the result is deterministic in tests. */
  now?: Date
}

function toNumber(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function buildCouponOffer(input: CouponOfferInput): CouponOffer {
  const fullPriceIls = toNumber(input.fullPriceIls) ?? 0
  const couponPriceIls = toNumber(input.couponPriceIls)
  const validUntil = toDate(input.validUntil)
  const now = input.now ?? new Date()

  // An expired offer is reported before a missing price, because that is what
  // the customer needs told: the deal ended, not that it is misconfigured.
  if (validUntil && validUntil.getTime() <= now.getTime()) {
    return { sellable: false, reason: 'expired', fullPriceIls, validUntil }
  }

  // No default, per the DB comment on the column and the commission engine's
  // guard. A coupon page without a price describes the offer and refuses the
  // sale rather than inventing 10% of the sticker.
  if (couponPriceIls === null || couponPriceIls <= 0) {
    return { sellable: false, reason: 'missing-price', fullPriceIls, validUntil }
  }

  // The DB constraint products_coupon_price_within_price already forbids this,
  // but it was added NOT VALID, so rows predating it can still violate it.
  // Clamping keeps the balance from rendering negative.
  const paidOnlineIls = Math.min(couponPriceIls, fullPriceIls)
  const balanceAtBusinessIls = Math.max(0, fullPriceIls - paidOnlineIls)

  return {
    sellable: true,
    fullPriceIls,
    paidOnlineIls,
    balanceAtBusinessIls,
    discountPercent: fullPriceIls > 0 ? Math.round((1 - paidOnlineIls / fullPriceIls) * 100) : 0,
    validUntil,
    expiryDays: toNumber(input.expiryDays),
  }
}

/** `₪1,234.50`, Hebrew locale, always two decimals so prices align in a column. */
export function shekelsFromIls(value: number): string {
  return `₪${value.toLocaleString('he-IL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}
