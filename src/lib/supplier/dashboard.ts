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
  supplierPayoutAgorot: number
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
 * Supplier due from the platform = immediate physical split only.
 * Coupon prepaid stays with the platform; till cash never enters our ledger.
 * Legacy `escrowHeldAgorot` columns are ignored (always 0 under 085).
 */
export function supplierDueAgorot(line: {
  supplierImmediateAgorot: number
  escrowHeldAgorot?: number
}): number {
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
    settlementStatus: s.settlementStatus,
    paidAt: s.paidAt,
  }))
}

export function sumPayoutBreakdown(lines: PayoutBreakdownLine[]): {
  grossAgorot: number
  platformFeeAgorot: number
  supplierPayoutAgorot: number
} {
  return lines.reduce(
    (acc, line) => ({
      grossAgorot: acc.grossAgorot + line.grossAgorot,
      platformFeeAgorot: acc.platformFeeAgorot + line.platformFeeAgorot,
      supplierPayoutAgorot: acc.supplierPayoutAgorot + line.supplierPayoutAgorot,
    }),
    { grossAgorot: 0, platformFeeAgorot: 0, supplierPayoutAgorot: 0 },
  )
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
