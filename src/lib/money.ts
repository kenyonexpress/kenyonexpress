/**
 * Canonical money math for checkout v1.
 *
 * Every internal amount is an integer number of agorot (1 ₪ = 100 agorot),
 * the same minor-unit scale Cardcom expects. Every rate is integer basis
 * points (10% = 1000 bp, 100% = 10000 bp). No float ever touches a money
 * value: all rounding is done with integer arithmetic (the ×2 half-up trick),
 * so results are deterministic and platform-independent.
 *
 * See COMPLETE-SYSTEM-ARCHITECTURE.md §0 (D-MONEY-1, D-PERCENT, D-VAT) and
 * MIGRATIONS-040-050.md §2 for the binding conventions this module implements.
 *
 * The branded `Agorot` type and the primitive constructors/aggregators live in
 * `./commerce/money` and are re-exported here so the whole app shares one brand.
 */

import {
  type Agorot,
  agorot,
  agorotToIls,
  formatIls,
  ilsToAgorot,
  multiplyAgorot,
  sumAgorot,
} from './commerce/money'

export type { Agorot }
export {
  agorot,
  agorotToIls,
  ilsToAgorot as parseIls,
  formatIls as formatAgorot,
  multiplyAgorot,
  sumAgorot,
}

// --- basis points ----------------------------------------------------------

declare const bpBrand: unique symbol

/** Integer basis points. 10000 bp = 100%. */
export type Bp = number & { readonly [bpBrand]: 'Bp' }

/** 100% expressed in basis points. */
export const BP_WHOLE = 10_000

/** Israeli VAT, 17%, expressed in basis points (the ledger default). */
export const VAT_RATE_BP = 1700

function assertSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} must be a safe integer (got ${value})`)
  }
}

/** Construct a validated basis-point value (0..10000). */
export function bp(value: number): Bp {
  assertSafeInteger(value, 'basis points')
  if (value < 0 || value > BP_WHOLE) {
    throw new RangeError(`basis points must be between 0 and ${BP_WHOLE} (got ${value})`)
  }
  return value as Bp
}

/** Convert a whole percent (e.g. 10 or "10") to basis points (1000). */
export function percentToBp(percent: number | string): Bp {
  const asNumber = typeof percent === 'string' ? Number.parseFloat(percent) : percent
  if (!Number.isFinite(asNumber)) {
    throw new TypeError(`percent must be finite (got ${percent})`)
  }
  // ×100 with integer half-up, so "33.33" -> 3333 bp deterministically.
  return bp(divRoundHalfUp(Math.round(asNumber * 100 * 100), 100))
}

/**
 * Integer half-up division: round(numerator / denominator) with ties going
 * away from zero, using only integer arithmetic (no float division).
 * `denominator` must be a positive integer.
 */
export function divRoundHalfUp(numerator: number, denominator: number): number {
  assertSafeInteger(numerator, 'numerator')
  assertSafeInteger(denominator, 'denominator')
  if (denominator <= 0) {
    throw new RangeError(`denominator must be positive (got ${denominator})`)
  }
  const sign = numerator < 0 ? -1 : 1
  const abs = Math.abs(numerator)
  const scaled = 2 * abs + denominator
  assertSafeInteger(scaled, 'half-up intermediate')
  return sign * Math.floor(scaled / (2 * denominator))
}

/**
 * Apply a basis-point rate to an amount: round_half_up(amount * bp / 10000).
 * This is the single multiply-by-rate primitive used for commission, cashback,
 * and the coupon on-site fraction.
 */
export function applyBp(amount: Agorot, points: Bp | number): Agorot {
  assertSafeInteger(amount, 'amount')
  assertSafeInteger(points, 'basis points')
  if (points < 0) {
    throw new RangeError(`basis points must be non-negative (got ${points})`)
  }
  const product = amount * points
  assertSafeInteger(product, 'rate product')
  return agorot(divRoundHalfUp(product, BP_WHOLE))
}

// --- VAT --------------------------------------------------------------------

export interface VatBreakdown {
  /** The gross (VAT-inclusive) amount that was split. */
  gross: Agorot
  /** Net amount, exclusive of VAT. */
  net: Agorot
  /** VAT portion. Always `gross - net`, so the split is exact and loss-free. */
  vat: Agorot
  /** The rate used, in basis points. */
  vatRateBp: number
}

/**
 * Extract VAT from a gross, VAT-inclusive amount (D-VAT).
 *   net = round_half_up(gross * 10000 / (10000 + vatRateBp))
 *   vat = gross - net
 * Because vat is computed by subtraction, net + vat === gross exactly, with no
 * rounding leak. The platform books this only on its own commission.
 */
export function extractVat(gross: Agorot, vatRateBp: number = VAT_RATE_BP): VatBreakdown {
  assertSafeInteger(gross, 'gross')
  assertSafeInteger(vatRateBp, 'vatRateBp')
  if (vatRateBp < 0 || vatRateBp > BP_WHOLE) {
    throw new RangeError(`vatRateBp must be between 0 and ${BP_WHOLE} (got ${vatRateBp})`)
  }
  const net = agorot(divRoundHalfUp(gross * BP_WHOLE, BP_WHOLE + vatRateBp))
  const vat = agorot(gross - net)
  return { gross, net, vat, vatRateBp }
}

export const moneyConstants = {
  agorotPerIls: 100,
  bpWhole: BP_WHOLE,
  vatRateBp: VAT_RATE_BP,
} as const
