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

/**
 * Israeli VAT, in basis points. ONE definition, for the whole app.
 *
 * This said 1700 while `src/lib/invoices/document.ts` said 18, with its own
 * comment reading "Standard Israeli VAT since 2025-01-01". Both were describing
 * the same tax and they disagreed by a point, which is the kind of split that
 * survives review because each file reads correct on its own.
 *
 * 18% is right: the rate rose from 17% to 18% on 2025-01-01. The invoice module
 * was the accurate one, and it is now derived from this constant rather than
 * carrying a second copy of the number.
 *
 * Scoped honestly, so nobody reads a fix into it that was not needed:
 * `extractVat` had NO application callers, only tests, so the stale 1700 was
 * never booked against a real sale. Every document that has actually been
 * issued went through the invoice path at 18. What this closes is the next
 * caller, which would have taken the canonical module's word for it.
 */
export const VAT_RATE_BP = 1800

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

const _moneyConstants = {
  agorotPerIls: 100,
  bpWhole: BP_WHOLE,
  vatRateBp: VAT_RATE_BP,
} as const

// --- boundaries (C141) -------------------------------------------------------
//
// Every place a money value enters or leaves the integer world goes through one
// of these. They are the ONLY code in `src/` allowed to call `Number(`,
// `parseFloat` or `.toFixed` on a money value; `money-invariants.test.ts`
// enforces that with a grep over the tree.

/**
 * An integer-agorot column (or RPC result, or JSON payload field) read from
 * the database. PostgREST hands `bigint` back as a string and `integer` as a
 * number; both land here. Missing, empty or unparseable reads as `fallback`.
 */
export function agorotFromDb(value: unknown, fallback = 0): Agorot {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? agorot(Math.round(value)) : agorot(fallback)
  }
  if (typeof value === 'bigint') return agorot(Number(value))
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (/^-?\d+$/.test(trimmed)) return agorot(Number.parseInt(trimmed, 10))
    // A fractional agorot value (should not exist, but legacy rows do): round
    // half away from zero on the first fraction digit, no float formed.
    const frac = /^(-?)(\d+)\.(\d+)$/.exec(trimmed)
    if (frac) {
      const [, sign, whole = '0', digits = '0'] = frac
      const abs = Number.parseInt(whole, 10) + (digits.charCodeAt(0) >= 53 ? 1 : 0)
      return agorot(sign === '-' && abs !== 0 ? -abs : abs)
    }
  }
  return agorot(fallback)
}

/** Like `agorotFromDb`, but a missing value stays `null` instead of 0. */
export function agorotFromDbOrNull(value: unknown): Agorot | null {
  if (value == null || value === '') return null
  return agorotFromDb(value)
}

/**
 * Decimal shekels as a string ("49.90", "50", "-3.5", "1.005") to agorot,
 * rounding any digits past the second half away from zero ON THE DIGITS, so no
 * binary fraction is formed. Returns null for anything that is not a decimal.
 */
function decimalStringToAgorot(raw: string): Agorot | null {
  const match = /^(-?)(\d*)(?:\.(\d*))?$/.exec(raw.trim())
  if (!match) return null
  const [, sign, wholePart = '', fractionPart = ''] = match
  if (wholePart === '' && fractionPart === '') return null
  const whole = wholePart === '' ? 0 : Number.parseInt(wholePart, 10)
  const cents = Number.parseInt(fractionPart.slice(0, 2).padEnd(2, '0'), 10)
  const roundUp = fractionPart.length > 2 && fractionPart.charCodeAt(2) >= 53 // '5'
  const abs = whole * 100 + cents + (roundUp ? 1 : 0)
  if (!Number.isSafeInteger(abs)) return null
  return agorot(sign === '-' && abs !== 0 ? -abs : abs)
}

/**
 * A shekel amount that arrives as a JS number (a legacy `numeric` ILS column,
 * a form field, a JSON body) to agorot. Goes through the shortest decimal
 * representation of the number, so 49.9 is 4990 and 1.005 is 101.
 */
export function agorotFromIlsNumber(value: number): Agorot {
  if (!Number.isFinite(value)) {
    throw new TypeError(`ILS amount must be finite (got ${value})`)
  }
  const exact = decimalStringToAgorot(String(value))
  if (exact != null) return exact
  // Only exponent notation is left: below half an agora it is zero, above
  // MAX_SAFE_INTEGER agorot it is not money we can hold.
  if (Math.abs(value) < 0.005) return agorot(0)
  throw new RangeError(`ILS amount out of range (got ${value})`)
}

/**
 * A legacy `numeric` shekel column (`kenyon_price`, `full_price`,
 * `coupon_price_ils`, ...) as PostgREST returns it: number, decimal string, or
 * null. Returns agorot, or null when the column is empty or not a number.
 */
export function agorotFromIlsColumn(value: unknown): Agorot | null {
  if (value == null) return null
  if (typeof value === 'number') return Number.isFinite(value) ? agorotFromIlsNumber(value) : null
  if (typeof value === 'string') return decimalStringToAgorot(value)
  return null
}

/** `agorotFromIlsColumn` with a missing value read as `fallback` agorot. */
export function agorotFromIlsColumnOr(value: unknown, fallback = 0): Agorot {
  return agorotFromIlsColumn(value) ?? agorot(fallback)
}

/**
 * Shekels as a plain number, for the legacy display props that still take one
 * (`PriceTag price=`). Derived from the agorot value, so it is exact to the
 * agora; null when the column is empty.
 */
export function ilsFromIlsColumn(value: unknown): number | null {
  const a = agorotFromIlsColumn(value)
  return a == null ? null : agorotToIls(a)
}

/** Agorot to a fixed two-decimal shekel string ("49.90"), by string arithmetic. */
export function agorotToDecimalString(value: Agorot | number): string {
  const rounded = Math.round(value)
  const sign = rounded < 0 ? '-' : ''
  const abs = Math.abs(rounded)
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}

/**
 * Admin whole-shekel input (decision 02.11.2026: admin enters whole shekels).
 * Accepts "49", "49.90" (rounded to the agora) and thousands separators;
 * returns null for an empty or invalid field.
 */
export function agorotFromShekelInput(raw: string | number | null | undefined): Agorot | null {
  if (raw == null) return null
  if (typeof raw === 'number') return Number.isFinite(raw) ? agorotFromIlsNumber(raw) : null
  const cleaned = raw.replace(/[,\s₪]/g, '')
  if (cleaned === '') return null
  return decimalStringToAgorot(cleaned)
}

/**
 * A percent column (`platform_percent numeric(5,2)`, `vat_percent`,
 * `cashback_percent`) to basis points. Null when empty or invalid.
 */
export function bpFromPercentColumn(value: unknown): number | null {
  if (value == null || value === '') return null
  const asString =
    typeof value === 'number' ? (Number.isFinite(value) ? String(value) : '') : String(value)
  // Percent and agorot share the same two-decimal scale: "12.5" -> 1250.
  const scaled = decimalStringToAgorot(asString)
  return scaled == null ? null : scaled
}

/** A percent column as a plain percent number (12.5), exact to 0.01. */
export function percentFromColumn(value: unknown): number | null {
  const points = bpFromPercentColumn(value)
  return points == null ? null : points / 100
}

/** Basis points as a percent string with fixed decimals: 1250 -> "12.50". */
export function bpToPercentString(points: number, decimals: 0 | 1 | 2 = 2): string {
  const rounded = Math.round(points)
  const sign = rounded < 0 ? '-' : ''
  const abs = Math.abs(rounded)
  if (decimals === 0) return `${sign}${divRoundHalfUp(abs, 100)}`
  if (decimals === 1) {
    const tenths = divRoundHalfUp(abs, 10)
    return `${sign}${Math.floor(tenths / 10)}.${tenths % 10}`
  }
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}

/** A ratio rendered as a percent string, e.g. (1, 3, 2) -> "33.33". Not money. */
export function ratioToPercentString(
  part: number,
  whole: number,
  decimals: 0 | 1 | 2 | 3 = 2,
): string {
  if (!whole) return '0'
  return ((part / whole) * 100).toFixed(decimals)
}

/** A plain number with fixed decimals for non-money display (rates, metrics). */
export function fixedDecimal(value: number, decimals: number): string {
  return Number.isFinite(value) ? value.toFixed(decimals) : '0'
}

/** A form field / query value to a finite number, or `fallback`. */
export function numberFromInput(raw: unknown, fallback = 0): number {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : fallback
  if (typeof raw !== 'string' || raw.trim() === '') return fallback
  const n = Number(raw)
  return Number.isFinite(n) ? n : fallback
}
