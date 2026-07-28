import type { CommissionProductType } from '@/lib/commerce/commission'
import { type Agorot, agorot } from '@/lib/commerce/money'
import type { VoucherState } from '@/server/domain/vouchers/state-machine'
import { type SettlementState, canTransition, deriveOrderStatus, transition } from './state-machine'

/** Consumer-protection cap on cancellation fees: 5% of the charge, capped at ₪100. */
const CANCELLATION_FEE_CAP_AGOROT = 10_000
const CANCELLATION_FEE_RATE = 0.05

/**
 * Legal cancellation fee (Israeli distance-selling law): the LOWER of 5% or ₪100.
 * Zero when the cancellation is due to a defect / non-conformity.
 */
export function computeCancellationFee(chargedAgorot: number, isDefectClaim: boolean): Agorot {
  if (isDefectClaim || chargedAgorot <= 0) return agorot(0)
  const fivePercent = Math.round(chargedAgorot * CANCELLATION_FEE_RATE)
  return agorot(Math.min(fivePercent, CANCELLATION_FEE_CAP_AGOROT))
}

export interface RefundLineInput {
  orderItemId: string
  productType: CommissionProductType
  settlementStatus: SettlementState
}

export interface RefundVoucherInput {
  voucherId: string
  status: VoucherState
}

export interface PlanRefundInput {
  /** The amount actually charged to the card for this order, in agorot. */
  cardChargedAgorot: number
  lines: RefundLineInput[]
  /** Every voucher of the order (coupon lines only; empty for physical-only orders). */
  vouchers: RefundVoucherInput[]
  isDefectClaim: boolean
  now: Date
  /** Explicit partial refund in agorot; when set, no cancellation fee is applied. */
  partialAmountAgorot?: number
}

export type RefundErrorCode = 'NOT_REFUNDABLE' | 'INVALID_AMOUNT'

export class RefundError extends Error {
  readonly code: RefundErrorCode
  constructor(code: RefundErrorCode, message: string) {
    super(message)
    this.name = 'RefundError'
    this.code = code
  }
}

export interface RefundLineTransition {
  orderItemId: string
  from: SettlementState
  to: SettlementState
}

export interface RefundPlan {
  /** Amount to charge back to the customer's card, in agorot. */
  refundAmountAgorot: Agorot
  cancellationFeeAgorot: Agorot
  lineTransitions: RefundLineTransition[]
  /** voucherIds that move issued -> refunded. */
  voucherRefunds: string[]
  /** Resulting order-level settlement state. */
  orderStatus: SettlementState
}

/**
 * Pure refund decision under the final rules. Validates each line against the
 * settlement state machine and refunds only vouchers still `issued`. A voucher
 * already redeemed or expired blocks the card refund: its value was consumed
 * at the business (or lapsed as breakage), so pulling the card money back
 * would refund consumed value. A post-consumption goodwill refund is a wallet
 * credit, which is a different money movement and never touches this planner.
 *
 * DB idempotency (don't refund twice) is enforced by the caller via the order
 * status guard, mirroring finalize's `paid_at` guard.
 */
export interface RefundBlocker {
  /** Hebrew, shown to the admin as-is. */
  message: string
  /** What the blocker attaches to, so the row can be highlighted. */
  voucherIds: string[]
  orderItemIds: string[]
}

/**
 * Why a card refund would be refused, named BEFORE the attempt.
 *
 * `planOrderRefund` already throws on all of these, but a thrown English
 * RefundError after the admin has clicked is not an answer to "can I refund
 * this order". The admin screen asks this first and shows the reason next to
 * the button, so the same rule is stated once and read twice.
 *
 * Empty result means a card refund is currently legal, not that it will
 * succeed: the provider round trip can still fail.
 */
export function describeRefundBlockers(input: {
  lines: RefundLineInput[]
  vouchers: RefundVoucherInput[]
}): RefundBlocker[] {
  const blockers: RefundBlocker[] = []

  const redeemed = input.vouchers.filter((v) => v.status === 'redeemed')
  if (redeemed.length > 0) {
    blockers.push({
      message: `${redeemed.length} שוברים כבר מומשו בבית העסק. הערך נצרך ולא ניתן להחזיר אותו לכרטיס.`,
      voucherIds: redeemed.map((v) => v.voucherId),
      orderItemIds: [],
    })
  }

  const expired = input.vouchers.filter((v) => v.status === 'expired')
  if (expired.length > 0) {
    blockers.push({
      message: `${expired.length} שוברים פגו. ערכם נזקף כפחת ולא חוזר לכרטיס.`,
      voucherIds: expired.map((v) => v.voucherId),
      orderItemIds: [],
    })
  }

  const stuck = input.lines.filter(
    (line) =>
      line.settlementStatus !== 'refunded' &&
      line.settlementStatus !== 'cancelled' &&
      !canTransition(line.settlementStatus, 'REFUND', line.productType),
  )
  const refundable = input.lines.filter(
    (line) =>
      line.settlementStatus !== 'refunded' &&
      line.settlementStatus !== 'cancelled' &&
      canTransition(line.settlementStatus, 'REFUND', line.productType),
  )
  if (refundable.length === 0) {
    blockers.push({
      message:
        stuck.length > 0
          ? 'אין שורות שניתן להחזיר: כולן כבר מומשו או שוחררו לספק.'
          : 'אין שורות שניתן להחזיר בהזמנה הזו.',
      voucherIds: [],
      orderItemIds: stuck.map((line) => line.orderItemId),
    })
  }

  return blockers
}

export function planOrderRefund(input: PlanRefundInput): RefundPlan {
  const consumed = input.vouchers.filter((v) => v.status === 'redeemed' || v.status === 'expired')
  if (consumed.length > 0) {
    throw new RefundError(
      'NOT_REFUNDABLE',
      'order has redeemed or expired vouchers; their value cannot return to the card',
    )
  }

  const refundable: RefundLineTransition[] = []
  let hasBlocking = false

  for (const line of input.lines) {
    // Already-terminal-refunded/cancelled lines are simply skipped (replay-safe).
    if (line.settlementStatus === 'refunded' || line.settlementStatus === 'cancelled') continue
    if (canTransition(line.settlementStatus, 'REFUND', line.productType)) {
      refundable.push({
        orderItemId: line.orderItemId,
        from: line.settlementStatus,
        to: transition(line.settlementStatus, 'REFUND', line.productType),
      })
    } else {
      // redeemed / escrow_released / pending etc. — cannot pull this money back.
      hasBlocking = true
    }
  }

  if (refundable.length === 0) {
    throw new RefundError(
      'NOT_REFUNDABLE',
      hasBlocking
        ? 'order has no refundable lines (already redeemed or released to supplier)'
        : 'order has no refundable lines',
    )
  }

  const cancellationFee =
    input.partialAmountAgorot !== undefined
      ? agorot(0)
      : computeCancellationFee(input.cardChargedAgorot, input.isDefectClaim)

  const rawRefund =
    input.partialAmountAgorot !== undefined
      ? input.partialAmountAgorot
      : input.cardChargedAgorot - cancellationFee

  if (rawRefund < 0 || rawRefund > input.cardChargedAgorot) {
    throw new RefundError('INVALID_AMOUNT', 'refund amount out of range')
  }

  const voucherRefunds = input.vouchers.filter((v) => v.status === 'issued').map((v) => v.voucherId)

  // Order state after applying the refund to every refundable line.
  const refundedIds = new Set(refundable.map((t) => t.orderItemId))
  const resultingStates = input.lines.map((line) =>
    refundedIds.has(line.orderItemId) ? ('refunded' as SettlementState) : line.settlementStatus,
  )

  return {
    refundAmountAgorot: agorot(rawRefund),
    cancellationFeeAgorot: cancellationFee,
    lineTransitions: refundable,
    voucherRefunds,
    orderStatus: deriveOrderStatus(resultingStates),
  }
}
