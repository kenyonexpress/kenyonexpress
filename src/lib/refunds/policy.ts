import { type Agorot, BP_WHOLE, agorot, applyBp, bp } from '@/lib/money'
import { cancellationFee, isWithinCancellationWindow } from '@/lib/vouchers/cancellation'

/**
 * Admin cancel + refund policy, as one pure decision.
 *
 * Coupon: unredeemed and inside 14 days of purchase refunds the price less
 * min(5%, 100 ILS). Past 14 days, or once redeemed, nothing is refunded.
 * Physical: refunds the per-product policy share of the price, default 100%.
 * Integer agorot and basis points only. Moves no money; the payment path does.
 */
const DEFAULT_PHYSICAL_REFUND_BP = bp(BP_WHOLE)

type RefundKind = 'coupon' | 'physical'

export type RefundDecision =
  | { refundable: true; refundAgorot: Agorot; feeAgorot: Agorot }
  | { refundable: false; reason: 'redeemed' | 'window_closed' | 'cancelled' | 'zero_policy' }

export interface RefundPolicyInput {
  kind: RefundKind
  paidAgorot: Agorot
  purchasedAt: Date
  now: Date
  /** Coupons only. */
  redeemed?: boolean
  cancelled?: boolean
  /** Physical only: product refund share in bp. Null/undefined means the 100% default. */
  productRefundBp?: number | null
}

export function decideRefund(input: RefundPolicyInput): RefundDecision {
  if (input.cancelled) return { refundable: false, reason: 'cancelled' }
  if (input.kind === 'coupon') {
    if (input.redeemed) return { refundable: false, reason: 'redeemed' }
    if (!isWithinCancellationWindow(input.purchasedAt, input.now)) {
      return { refundable: false, reason: 'window_closed' }
    }
    const q = cancellationFee(input.paidAgorot)
    return { refundable: true, refundAgorot: q.refundAgorot, feeAgorot: q.feeAgorot }
  }
  const raw = input.productRefundBp
  const share = typeof raw === 'number' && Number.isInteger(raw) ? raw : DEFAULT_PHYSICAL_REFUND_BP
  const clamped = Math.min(Math.max(share, 0), BP_WHOLE)
  if (clamped === 0) return { refundable: false, reason: 'zero_policy' }
  const refundAgorot = applyBp(input.paidAgorot, clamped)
  return {
    refundable: true,
    refundAgorot,
    feeAgorot: agorot(input.paidAgorot - refundAgorot),
  }
}

const _REFUND_REASON_HE: Record<Extract<RefundDecision, { refundable: false }>['reason'], string> =
  {
    redeemed: 'הקופון מומש, אין החזר',
    window_closed: 'עברו יותר מ-14 ימים, אין החזר',
    cancelled: 'כבר בוטל',
    zero_policy: 'מדיניות המוצר ללא החזר',
  }
