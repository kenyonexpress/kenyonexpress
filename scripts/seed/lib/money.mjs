// scripts/seed/lib/money.mjs
//
// Money in this seed is an integer number of agorot. Nothing else.
//
// WHY, WHEN HALF THE SCHEMA IS numeric ILS
//
// The database is mid-convergence. vouchers and the 054-era order_items
// settlement columns are already integer agorot; products.price_ils,
// orders.total_ils and order_items.unit_price_ils are still numeric(12,2) ILS,
// because migration 059 (money_integer_units) exists in supabase/migrations but
// has not been applied to every target. A seed that authored ILS decimals would
// have to round on the way into the agorot columns, and rounding is exactly the
// step that invents the drift these tables are checked for
// (vouchers_conservation: face_value = coupon_price + remaining_due).
//
// So the seed authors one unit, agorot, and converts at the write boundary:
// toIls() renders an exact 2-decimal string for a numeric ILS column. That
// conversion is total and lossless in this direction (agorot -> ILS is a shift
// of the decimal point), whereas ILS -> agorot is not. See
// docs/ARCHITECTURE-SEED-DATA.md section 4.

const AGOROT_PER_ILS = 100

export function assertAgorot(value, label = 'amount') {
  if (!Number.isSafeInteger(value)) {
    throw new TypeError(`${label} must be an integer number of agorot, got ${value}`)
  }
  return value
}

/** Shekels (a literal in the data files) to agorot. Rejects sub-agora input. */
export function ils(value) {
  const scaled = Math.round(value * AGOROT_PER_ILS)
  if (Math.abs(scaled - value * AGOROT_PER_ILS) > 1e-6) {
    throw new TypeError(`${value} ILS is not a whole number of agorot`)
  }
  return assertAgorot(scaled)
}

/** Exact decimal string for a numeric(12,2) ILS column. Never a float. */
export function toIls(value) {
  assertAgorot(value)
  const sign = value < 0 ? '-' : ''
  const abs = Math.abs(value)
  return `${sign}${Math.trunc(abs / AGOROT_PER_ILS)}.${String(abs % AGOROT_PER_ILS).padStart(2, '0')}`
}

/**
 * `percent` of `amount`, rounded half-up to the agora. Used for the platform
 * share; the counterpart is always computed as the remainder, never as the
 * complementary percentage, so the two halves add back to the whole exactly.
 */
export function percentOf(amount, percent) {
  assertAgorot(amount)
  if (!(percent >= 0 && percent <= 100)) {
    throw new RangeError(`percent must be within 0..100, got ${percent}`)
  }
  return assertAgorot(Math.round((amount * percent) / 100))
}

/**
 * Splits `amount` into { platform, supplier } by percent. The supplier side is
 * the remainder, which is what makes platform + supplier === amount hold for
 * every input rather than for most of them.
 */
export function splitByPercent(amount, platformPercent) {
  const platform = percentOf(amount, platformPercent)
  const supplier = assertAgorot(amount - platform)
  return { platform, supplier }
}

/** Price after a percentage discount, rounded to the agora. */
export function applyDiscount(amount, discountPercent) {
  assertAgorot(amount)
  if (!(discountPercent >= 0 && discountPercent <= 100)) {
    throw new RangeError(`discount must be within 0..100, got ${discountPercent}`)
  }
  return assertAgorot(amount - Math.round((amount * discountPercent) / 100))
}

export function sum(values) {
  return values.reduce((total, value) => assertAgorot(total + assertAgorot(value)), 0)
}

/** Percent (numeric column) to basis points (the 059-era *_bp columns). */
export function percentToBp(percent) {
  return Math.round(percent * 100)
}

/** For log lines. Not for storage. */
export function formatIls(value) {
  return `₪${toIls(value)}`
}
