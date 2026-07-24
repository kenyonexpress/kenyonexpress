import type { CommissionProductType } from '@/lib/commerce/commission'
import { type Agorot, agorot } from '@/lib/commerce/money'
import type { EscrowHoldStatus } from './escrow'
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

export interface RefundHoldInput {
  couponCodeId: string
  status: EscrowHoldStatus
  heldAgorot: number
}

export interface PlanRefundInput {
  /** The amount actually charged to the card for this order, in agorot. */
  cardChargedAgorot: number
  lines: RefundLineInput[]
  holds: RefundHoldInput[]
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
  /** couponCodeIds whose escrow hold moves held -> refunded. */
  holdRefunds: string[]
  /** Resulting order-level settlement state. */
  orderStatus: SettlementState
}

/**
 * Pure refund decision. Validates each line against the settlement state machine,
 * computes the (fee-adjusted) card refund, and reverses only escrow holds still
 * `held`. A line already past the platform's custody (redeemed / escrow_released)
 * makes the whole order non-refundable — the platform no longer holds that money.
 *
 * DB idempotency (don't refund twice) is enforced by the caller via the order
 * status guard, mirroring finalize's `paid_at` guard.
 */
export function planOrderRefund(input: PlanRefundInput): RefundPlan {
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

  const holdRefunds = input.holds.filter((h) => h.status === 'held').map((h) => h.couponCodeId)

  // Order state after applying the refund to every refundable line.
  const refundedIds = new Set(refundable.map((t) => t.orderItemId))
  const resultingStates = input.lines.map((line) =>
    refundedIds.has(line.orderItemId) ? ('refunded' as SettlementState) : line.settlementStatus,
  )

  return {
    refundAmountAgorot: agorot(rawRefund),
    cancellationFeeAgorot: cancellationFee,
    lineTransitions: refundable,
    holdRefunds,
    orderStatus: deriveOrderStatus(resultingStates),
  }
}
