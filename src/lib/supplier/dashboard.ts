/**
 * Pure aggregations for the supplier sales dashboard and payout view.
 * Money stays in agorot integers; pages format via formatIls.
 */

export type SupplierSaleLine = {
  orderItemId: string
  orderId: string
  productName: string
  productType: 'coupon' | 'physical' | 'other'
  quantity: number
  platformPercent: number | null
  faceValueAgorot: number
  paidOnSiteAgorot: number
  platformFeeAgorot: number
  supplierImmediateAgorot: number
  escrowHeldAgorot: number
  escrowReleaseAgorot: number
  supplierDueAgorot: number
  settlementStatus: string | null
  paidAt: string | null
}

export type SupplierRedemptionRow = {
  voucherId: string
  code: string
  productName: string
  customerName: string | null
  remainingAmountDueAgorot: number
  couponPriceAgorot: number
  platformPercent: number
  redeemedAt: string | null
  status: string
}

export type SupplierDashboardStats = {
  redemptionsToday: number
  tillCollectedTodayAgorot: number
  salesPaidCount: number
  salesGrossAgorot: number
  platformFeeAgorot: number
  /** Physical lines only under the no-Escrow model (coupon prepaid stays with the platform). */
  supplierDueAgorot: number
  /** Lifetime successful coupon scans for this supplier (not a money hold). */
  couponRedemptionsTotal: number
}

export type PayoutBreakdownLine = {
  orderItemId: string
  productName: string
  productType: string
  platformPercent: number | null
  grossAgorot: number
  platformFeeAgorot: number
  /** Payable now. Zero on a reversed line; see `supplierDueAgorot`. */
  supplierPayoutAgorot: number
  /** What a reversed line would have paid. Zero on every other line. */
  reversedPayoutAgorot: number
  settlementStatus: string | null
  paidAt: string | null
}

function startOfIsraelDay(now = new Date()): Date {
  // Approximate "today" in Asia/Jerusalem for dashboard windows without a TZ lib.
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const day = fmt.format(now) // YYYY-MM-DD
  return new Date(`${day}T00:00:00+03:00`)
}

export function isRedeemedToday(redeemedAt: string | null | undefined, now = new Date()): boolean {
  if (!redeemedAt) return false
  const at = new Date(redeemedAt)
  return at.getTime() >= startOfIsraelDay(now).getTime()
}

/**
 * Settlement states in which the line's supplier share has been reversed.
 *
 * `refunded` is written by `refundOrder` on every line it pulls back, and
 * `cancelled` is the state a line that never completed lands in. Both mean the
 * sale is undone, and neither is filtered out upstream: `getSupplierSales`
 * selects on `orders.paid_at IS NOT NULL`, and a refunded order keeps its
 * `paid_at` -- that is what makes it a refund rather than an abandoned cart.
 * So the rows arrive here and something has to decide what they are worth.
 */
export const REVERSED_SETTLEMENT_STATUSES: ReadonlySet<string> = new Set(['refunded', 'cancelled'])

/** Whether this line's supplier share has been reversed. */
export function isReversedLine(settlementStatus: string | null | undefined): boolean {
  return settlementStatus != null && REVERSED_SETTLEMENT_STATUSES.has(settlementStatus)
}

/**
 * Supplier due from the platform = immediate physical split only.
 * Coupon prepaid stays with the platform; till cash never enters our ledger.
 * Legacy `escrowHeldAgorot` columns are ignored (always 0 under 085).
 *
 * A REVERSED LINE IS DUE NOTHING, and this is the second time that sentence
 * has had to be written here. The first was escrow: this function used to
 * return `immediate + held`, which told a supplier they were owed money that
 * was never going to arrive. A refund is the same failure with a different
 * column. `refundOrder` writes `settlement_status = 'refunded'` and journals a
 * `supplier_debit` clawing the share back, but it does NOT zero
 * `supplier_immediate_agorot` -- deliberately, because that column is the
 * snapshot of what was agreed at purchase and rewriting it would destroy the
 * record of the original split. Reading it as a live receivable is what was
 * wrong, not the column.
 *
 * Everything a supplier sees about money goes through here: the dashboard
 * balance, the payouts page, the all-time CSV, the monthly statement and its
 * PDF, and the supplier revenue line in analytics. One function, so the
 * statement handed to a bookkeeper and the ledger the reconciliation cron
 * reads cannot disagree about a refunded sale.
 */
export function supplierDueAgorot(line: {
  supplierImmediateAgorot: number
  escrowHeldAgorot?: number
  settlementStatus?: string | null
}): number {
  if (isReversedLine(line.settlementStatus)) return 0
  return Math.max(0, line.supplierImmediateAgorot)
}

/**
 * What a reversed line WOULD have paid, for the statement to show as a credit.
 *
 * Zeroing the payout without saying why produces a document a supplier cannot
 * reconcile: a sale they remember, a line that reads zero, and no number
 * anywhere that accounts for the difference. This is that number, and it is
 * zero on a line that was not reversed.
 */
export function reversedPayoutAgorot(line: {
  supplierImmediateAgorot: number
  settlementStatus?: string | null
}): number {
  if (!isReversedLine(line.settlementStatus)) return 0
  return Math.max(0, line.supplierImmediateAgorot)
}

export function aggregateDashboard(input: {
  sales: SupplierSaleLine[]
  redemptions: SupplierRedemptionRow[]
  now?: Date
}): SupplierDashboardStats {
  const now = input.now ?? new Date()
  let redemptionsToday = 0
  let tillCollectedTodayAgorot = 0
  let couponRedemptionsTotal = 0
  for (const r of input.redemptions) {
    if (r.status !== 'redeemed') continue
    couponRedemptionsTotal += 1
    if (!isRedeemedToday(r.redeemedAt, now)) continue
    redemptionsToday += 1
    tillCollectedTodayAgorot += Math.max(0, r.remainingAmountDueAgorot)
  }

  let salesGrossAgorot = 0
  let platformFeeAgorot = 0
  let supplierDue = 0
  for (const s of input.sales) {
    salesGrossAgorot += Math.max(0, s.faceValueAgorot)
    platformFeeAgorot += Math.max(0, s.platformFeeAgorot)
    supplierDue += supplierDueAgorot(s)
  }

  return {
    redemptionsToday,
    tillCollectedTodayAgorot,
    salesPaidCount: input.sales.length,
    salesGrossAgorot,
    platformFeeAgorot,
    supplierDueAgorot: supplierDue,
    couponRedemptionsTotal,
  }
}

/**
 * Payout view lines: one row per paid order item, showing how platform_percent
 * splits gross into platform fee vs supplier share (ARCHITECTURE §0).
 */
export function toPayoutBreakdown(sales: SupplierSaleLine[]): PayoutBreakdownLine[] {
  return sales.map((s) => ({
    orderItemId: s.orderItemId,
    productName: s.productName,
    productType: s.productType,
    platformPercent: s.platformPercent,
    grossAgorot: Math.max(0, s.productType === 'coupon' ? s.paidOnSiteAgorot : s.faceValueAgorot),
    platformFeeAgorot: Math.max(0, s.platformFeeAgorot),
    supplierPayoutAgorot: supplierDueAgorot(s),
    reversedPayoutAgorot: reversedPayoutAgorot(s),
    settlementStatus: s.settlementStatus,
    paidAt: s.paidAt,
  }))
}

export function sumPayoutBreakdown(lines: PayoutBreakdownLine[]): {
  grossAgorot: number
  platformFeeAgorot: number
  supplierPayoutAgorot: number
  reversedPayoutAgorot: number
} {
  return lines.reduce(
    (acc, line) => ({
      grossAgorot: acc.grossAgorot + line.grossAgorot,
      platformFeeAgorot: acc.platformFeeAgorot + line.platformFeeAgorot,
      supplierPayoutAgorot: acc.supplierPayoutAgorot + line.supplierPayoutAgorot,
      reversedPayoutAgorot: acc.reversedPayoutAgorot + line.reversedPayoutAgorot,
    }),
    { grossAgorot: 0, platformFeeAgorot: 0, supplierPayoutAgorot: 0, reversedPayoutAgorot: 0 },
  )
}

export type SupplierSettlementBalance = {
  /** Owed by the platform. Physical residual only; a coupon never adds here. */
  platformOwedAgorot: number
  /** Reversed by refunds, and therefore NOT part of `platformOwedAgorot`. */
  reversedAgorot: number
  /** Already taken over the counter on redeemed coupons. Never our money. */
  tillCollectedAgorot: number
  /** What the platform kept, across both kinds. */
  platformFeeAgorot: number
  /** Line counts by settlement_status, for the history breakdown. */
  byStatus: Array<{ status: string; count: number; supplierDueAgorot: number }>
}

/**
 * The two balances a supplier has, kept apart on purpose.
 *
 * A single "balance" number cannot be honest here, because the two halves of
 * this business settle in opposite directions (section 0.2). Physical sales
 * leave the platform holding money it owes the shop. Coupons leave the shop
 * holding money the platform never touches: the customer prepaid us the coupon
 * price, and the till balance is collected at the counter in cash that does not
 * enter our ledger. Adding them produces a figure that is neither a receivable
 * nor a takings report, and reading it as "what KenyonExpress will transfer"
 * -- which is how anyone reads a number labelled balance -- overstates the
 * transfer by the entire coupon column.
 *
 * So: `platformOwedAgorot` is the receivable, `tillCollectedAgorot` is the
 * takings, and no function in this file ever returns their sum.
 */
export function summarizeSettlement(input: {
  sales: SupplierSaleLine[]
  redemptions: SupplierRedemptionRow[]
}): SupplierSettlementBalance {
  let platformOwed = 0
  let platformFee = 0
  let reversed = 0
  const buckets = new Map<string, { count: number; supplierDueAgorot: number }>()

  for (const sale of input.sales) {
    const due = supplierDueAgorot(sale)
    platformOwed += due
    reversed += reversedPayoutAgorot(sale)
    platformFee += Math.max(0, sale.platformFeeAgorot)

    const key = sale.settlementStatus ?? 'pending'
    const bucket = buckets.get(key)
    if (bucket) {
      bucket.count += 1
      bucket.supplierDueAgorot += due
    } else {
      buckets.set(key, { count: 1, supplierDueAgorot: due })
    }
  }

  let tillCollected = 0
  for (const redemption of input.redemptions) {
    if (redemption.status !== 'redeemed') continue
    tillCollected += Math.max(0, redemption.remainingAmountDueAgorot)
  }

  return {
    platformOwedAgorot: platformOwed,
    reversedAgorot: reversed,
    tillCollectedAgorot: tillCollected,
    platformFeeAgorot: platformFee,
    byStatus: [...buckets.entries()]
      .map(([status, value]) => ({ status, ...value }))
      .sort((a, b) => b.count - a.count || a.status.localeCompare(b.status)),
  }
}

export const SETTLEMENT_LABEL_HE: Record<string, string> = {
  pending: 'ממתין',
  paid: 'שולם באתר',
  split_executed: 'פוצל',
  platform_settled: 'סולק לפלטפורמה',
  escrow_held: 'סולק (מיושן)',
  escrow_released: 'סולק (מיושן)',
  redeemed: 'מומש',
  refunded: 'זוכה',
  cancelled: 'בוטל',
}
