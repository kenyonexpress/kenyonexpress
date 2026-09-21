/**
 * Operations KPIs for the admin analytics page: redemption and refunds.
 *
 * The sales KPIs (GMV, platform revenue, orders, AOV, take rate) come from the
 * order lines in `aggregate.ts`. These two answer a different question, "of
 * what was sold, what actually happened next", and they read two other
 * tables: `vouchers` for redemption and `refunds` for money going back. Pure
 * arithmetic only; the loader in `server/analytics/queries.ts` feeds it.
 *
 * Rates are returned in basis points, as integers, for the same reason the
 * money path uses agorot: a share of 1/3 rendered as 33.3% twice and then
 * summed elsewhere would drift, and an integer never does.
 */

import { agorot } from '@/lib/money'
import type { Agorot } from '@/lib/money'

export interface VoucherCounts {
  /** Vouchers created in the window, every status. */
  issued: number
  /** Of those, the ones a supplier scanned. */
  redeemed: number
  /** Of those, cancelled or refunded: never redeemable, so not part of the rate. */
  voided: number
}

export interface RefundCounts {
  /** Refund requests opened in the window, every state. */
  requested: number
  /** Of those, completed: money actually went back. */
  completed: number
  /** Sum of `granted_agorot` on the completed ones. */
  grantedAgorot: Agorot
}

export interface OpsKpis {
  vouchers: VoucherCounts
  refunds: RefundCounts
  /** redeemed / (issued - voided), basis points; null when nothing is redeemable. */
  redemptionRateBp: number | null
  /** completed refunds / paid orders, basis points; null with no paid orders. */
  refundRateBp: number | null
  /** granted / GMV, basis points; null with no GMV. */
  refundShareOfGmvBp: number | null
}

/** Integer basis points of `part` in `whole`, rounded half up; null when `whole` is 0. */
export function shareBp(part: number, whole: number): number | null {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return null
  if (part <= 0) return 0
  return Math.floor((part * 10_000) / whole + 0.5)
}

/** "33.3%" from basis points; one decimal, Hebrew locale is digit-identical. */
export function formatBp(value: number | null): string {
  if (value === null) return '—'
  return `${(value / 100).toFixed(1)}%`
}

export function computeOpsKpis(input: {
  vouchers: VoucherCounts
  refunds: RefundCounts
  paidOrders: number
  gmvAgorot: Agorot
}): OpsKpis {
  const redeemable = Math.max(0, input.vouchers.issued - input.vouchers.voided)
  return {
    vouchers: input.vouchers,
    refunds: input.refunds,
    redemptionRateBp: shareBp(input.vouchers.redeemed, redeemable),
    refundRateBp: shareBp(input.refunds.completed, input.paidOrders),
    refundShareOfGmvBp: shareBp(input.refunds.grantedAgorot, input.gmvAgorot),
  }
}

export const EMPTY_VOUCHERS: VoucherCounts = { issued: 0, redeemed: 0, voided: 0 }
export const EMPTY_REFUNDS: RefundCounts = { requested: 0, completed: 0, grantedAgorot: agorot(0) }
