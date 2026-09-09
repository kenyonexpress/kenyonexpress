import { divRoundHalfUp } from '@/lib/money'

/**
 * The expiry rate per supplier, and the argument about what it is a rate OF.
 *
 * =========================================================================
 * THE DENOMINATOR IS THE WHOLE DECISION
 * =========================================================================
 *
 * "Expiry rate" has three plausible readings and they do not agree, so the one
 * this project uses is named here once and computed here once. The database
 * function `supplier_expiry_metrics` deliberately returns COUNTS and no rate:
 * a ratio derived in two places is a ratio that eventually disagrees with
 * itself, and the disagreement surfaces as an operator and a supplier quoting
 * different numbers at each other.
 *
 *   expired / issued    WRONG, and wrong in a way that flatters. Every voucher
 *                       sold this week is in the denominator and none of them
 *                       could possibly have expired yet, so a supplier who has
 *                       just run a campaign looks excellent. The number moves
 *                       when SALES move, which is not what it claims to measure.
 *
 *   expired / (expired + redeemed)   USED. Of the coupons that have finished --
 *                       one way or the other -- what share died unused. Live
 *                       coupons are excluded because they have not decided yet,
 *                       and including an undecided outcome in an outcome rate is
 *                       the same error as the first reading, just smaller.
 *
 *   value-weighted      Not used as THE rate, but `expiredValueAgorot` is
 *                       returned beside it, because ten lapsed ₪9 coupons and
 *                       one lapsed ₪699 cabin are the same rate and are not the
 *                       same problem.
 *
 * =========================================================================
 * NO RATE AT ALL IS AN ANSWER, AND IT IS NOT ZERO
 * =========================================================================
 *
 * A supplier whose vouchers are all still live has an empty denominator. That
 * is `null`, never 0: 0% is the best possible score and would put a supplier
 * nobody has measured at the top of a table sorted by how well they are doing.
 * Every caller has to decide what to print for `null`, which is the point.
 *
 * =========================================================================
 * THE UNCREDITED GAP IS THE OPERATIONAL NUMBER
 * =========================================================================
 *
 * `expiredValueAgorot - creditedValueAgorot` is money the platform owes
 * customers for coupons that lapsed and has not moved yet. In a healthy night
 * it is zero by morning. A figure that stays up is `credit_expired_vouchers()`
 * failing or falling behind its 500-per-run cap, and the cron route returns 500
 * on that failure -- but a 500 in a log nobody reads is not a report. This makes
 * it a number on a screen.
 *
 * Integer agorot throughout, and the rate is integer basis points rather than a
 * float percentage, for the reason `lib/money.ts` gives: a ratio that is only
 * ever divided at the moment it is printed cannot drift.
 */

/** One row of `supplier_expiry_metrics`, already converted to integers. */
export interface SupplierExpiryCounts {
  supplierId: string
  supplierName: string | null
  issuedCount: number
  liveCount: number
  redeemedCount: number
  expiredCount: number
  expiredValueAgorot: number
  creditedValueAgorot: number
}

export interface SupplierExpiryMetric extends SupplierExpiryCounts {
  /** expired + redeemed. The coupons that have actually finished. */
  settledCount: number
  /** Basis points, 0..10000. Null when nothing has settled yet. */
  rateBp: number | null
  /** Owed to customers for lapsed coupons and not yet moved. Integer agorot. */
  uncreditedAgorot: number
}

function nonNegative(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.trunc(n))
}

/** Counts as they arrive from PostgREST -- bigint columns come back as strings. */
export function toSupplierExpiryCounts(row: Record<string, unknown>): SupplierExpiryCounts {
  return {
    supplierId: String(row.supplier_id ?? ''),
    supplierName:
      typeof row.supplier_name === 'string' && row.supplier_name.trim() !== ''
        ? row.supplier_name.trim()
        : null,
    issuedCount: nonNegative(row.issued_count),
    liveCount: nonNegative(row.live_count),
    redeemedCount: nonNegative(row.redeemed_count),
    expiredCount: nonNegative(row.expired_count),
    expiredValueAgorot: nonNegative(row.expired_value_agorot),
    creditedValueAgorot: nonNegative(row.credited_value_agorot),
  }
}

export function supplierExpiryMetric(counts: SupplierExpiryCounts): SupplierExpiryMetric {
  const settledCount = counts.expiredCount + counts.redeemedCount
  return {
    ...counts,
    settledCount,
    rateBp: settledCount === 0 ? null : divRoundHalfUp(counts.expiredCount * 10_000, settledCount),
    // Clamped at zero: credited can exceed expired only if the two sums were
    // read at different moments, and a negative debt printed on a screen is a
    // number nobody can act on.
    uncreditedAgorot: Math.max(0, counts.expiredValueAgorot - counts.creditedValueAgorot),
  }
}

/**
 * Worst first, and a supplier with no settled coupons is always last.
 *
 * Sorting `null` as 0 would bury the suppliers who need looking at under the
 * ones nobody has data for. Ties break on how much money lapsed, because that
 * is the difference between two identical-looking rates that matters.
 */
export function byExpiryRateDesc(a: SupplierExpiryMetric, b: SupplierExpiryMetric): number {
  if (a.rateBp === null && b.rateBp === null) return b.expiredCount - a.expiredCount
  if (a.rateBp === null) return 1
  if (b.rateBp === null) return -1
  if (a.rateBp !== b.rateBp) return b.rateBp - a.rateBp
  return b.expiredValueAgorot - a.expiredValueAgorot
}

/**
 * `1234` -> `12.3%`. One decimal and no more: basis points carry two, and the
 * second one is noise on the sample sizes a single supplier produces.
 */
export function formatRateBp(rateBp: number | null): string {
  if (rateBp === null) return '—'
  const tenths = divRoundHalfUp(rateBp, 10)
  const whole = Math.trunc(tenths / 10)
  const decimal = Math.abs(tenths % 10)
  return `${whole}.${decimal}%`
}

/** The whole platform's figures, from the per-supplier rows. */
export function totalExpiryMetric(rows: SupplierExpiryCounts[]): SupplierExpiryMetric {
  const summed = rows.reduce<SupplierExpiryCounts>(
    (acc, row) => ({
      supplierId: '',
      supplierName: null,
      issuedCount: acc.issuedCount + row.issuedCount,
      liveCount: acc.liveCount + row.liveCount,
      redeemedCount: acc.redeemedCount + row.redeemedCount,
      expiredCount: acc.expiredCount + row.expiredCount,
      expiredValueAgorot: acc.expiredValueAgorot + row.expiredValueAgorot,
      creditedValueAgorot: acc.creditedValueAgorot + row.creditedValueAgorot,
    }),
    {
      supplierId: '',
      supplierName: null,
      issuedCount: 0,
      liveCount: 0,
      redeemedCount: 0,
      expiredCount: 0,
      expiredValueAgorot: 0,
      creditedValueAgorot: 0,
    },
  )
  // Note this is NOT the mean of the per-supplier rates. A supplier with four
  // settled coupons and one with four hundred would count equally in a mean,
  // and the platform's rate is a fact about coupons, not about suppliers.
  return supplierExpiryMetric(summed)
}
