import type { CommissionProductType } from '@/lib/commerce/commission'

/**
 * Settlement lifecycle of an order line (and, derived, of an order), under the
 * final business rules (2026-07-24): no escrow anywhere.
 *
 * Physical happy path: pending -> paid -> split_executed
 * Coupon happy path:   pending -> paid -> platform_settled
 *   (the on-site charge is platform revenue the moment the order is paid;
 *   voucher redemption and expiry are voucher-level events that move no money)
 * Failure paths: pending -> cancelled;
 *   paid | platform_settled | split_executed -> refunded
 *
 * Escrow flow (ESCROW_FLOW_ENABLED, feat/checkout-cardcom): coupon lines may
 * instead take pending -> paid -> escrow_held -> escrow_released. The hold is
 * INTERNAL per C3 (a ledger record, no external escrow, no J5): the upfront is
 * held until redemption, then released to supplier_payable minus the platform
 * fee. With the flag off no new row enters the escrow states; they also remain
 * for rows written by the pre-2026-07-24 escrow model.
 */
export type SettlementState =
  | 'pending'
  | 'paid'
  | 'split_executed'
  | 'platform_settled'
  | 'escrow_held'
  | 'escrow_released'
  | 'redeemed'
  | 'refunded'
  | 'cancelled'

export type SettlementEvent =
  | 'PAYMENT_CONFIRMED'
  | 'EXECUTE_SPLIT'
  | 'SETTLE_PLATFORM'
  | 'HOLD_ESCROW'
  | 'RELEASE_ESCROW'
  | 'REFUND'
  | 'CANCEL'

export const SETTLEMENT_STATES: readonly SettlementState[] = [
  'pending',
  'paid',
  'split_executed',
  'platform_settled',
  'escrow_held',
  'escrow_released',
  'redeemed',
  'refunded',
  'cancelled',
]

export const SETTLEMENT_EVENTS: readonly SettlementEvent[] = [
  'PAYMENT_CONFIRMED',
  'EXECUTE_SPLIT',
  'SETTLE_PLATFORM',
  'HOLD_ESCROW',
  'RELEASE_ESCROW',
  'REFUND',
  'CANCEL',
]

type TransitionRule = {
  to: SettlementState
  /** When set, the event is legal only for lines of this product type. */
  productType?: CommissionProductType
}

/**
 * Single source of truth for legal transitions.
 * REFUND from split_executed covers physical returns inside the legal window
 * (money recovery from the supplier happens via payout adjustments).
 * REFUND from platform_settled is legal only while every voucher of the line
 * is still `issued`; the refund planner checks the voucher states.
 * Legacy escrow_held rows can still be refunded; redeemed / escrow_released
 * rows cannot (their value was already consumed at the business).
 */
const TRANSITIONS: Readonly<
  Record<SettlementState, Partial<Record<SettlementEvent, TransitionRule>>>
> = {
  pending: {
    PAYMENT_CONFIRMED: { to: 'paid' },
    CANCEL: { to: 'cancelled' },
  },
  paid: {
    EXECUTE_SPLIT: { to: 'split_executed', productType: 'physical' },
    SETTLE_PLATFORM: { to: 'platform_settled', productType: 'coupon' },
    HOLD_ESCROW: { to: 'escrow_held', productType: 'coupon' },
    REFUND: { to: 'refunded' },
  },
  platform_settled: {
    REFUND: { to: 'refunded' },
  },
  escrow_held: {
    RELEASE_ESCROW: { to: 'escrow_released', productType: 'coupon' },
    REFUND: { to: 'refunded' },
  },
  redeemed: {},
  split_executed: {
    REFUND: { to: 'refunded' },
  },
  escrow_released: {},
  refunded: {},
  cancelled: {},
}

export type TransitionErrorCode = 'ILLEGAL_TRANSITION' | 'WRONG_PRODUCT_TYPE'

export class SettlementTransitionError extends Error {
  readonly code: TransitionErrorCode
  readonly from: SettlementState
  readonly event: SettlementEvent

  constructor(code: TransitionErrorCode, from: SettlementState, event: SettlementEvent) {
    super(`${code}: ${event} from ${from}`)
    this.name = 'SettlementTransitionError'
    this.code = code
    this.from = from
    this.event = event
  }
}

export function canTransition(
  from: SettlementState,
  event: SettlementEvent,
  productType: CommissionProductType,
): boolean {
  const rule = TRANSITIONS[from][event]
  if (!rule) return false
  return rule.productType === undefined || rule.productType === productType
}

/** Applies an event, throwing SettlementTransitionError when illegal. */
export function transition(
  from: SettlementState,
  event: SettlementEvent,
  productType: CommissionProductType,
): SettlementState {
  const rule = TRANSITIONS[from][event]
  if (!rule) {
    throw new SettlementTransitionError('ILLEGAL_TRANSITION', from, event)
  }
  if (rule.productType !== undefined && rule.productType !== productType) {
    throw new SettlementTransitionError('WRONG_PRODUCT_TYPE', from, event)
  }
  return rule.to
}

export function isTerminal(state: SettlementState): boolean {
  const events = TRANSITIONS[state]
  return Object.keys(events).length === 0
}

/** States in which the platform no longer owes anyone money for the line. */
export function isSettled(state: SettlementState): boolean {
  return (
    state === 'split_executed' ||
    state === 'platform_settled' ||
    state === 'escrow_released' ||
    state === 'refunded' ||
    state === 'cancelled'
  )
}

/**
 * Order-level rollup from line states, in the same enum.
 * The order shows the least-advanced ACTIVE line; once every line is settled,
 * the dominant settlement outcome wins (escrow_released over split_executed,
 * because the coupon leg is the last to settle in a mixed order).
 */
export function deriveOrderStatus(lineStates: readonly SettlementState[]): SettlementState {
  if (lineStates.length === 0) return 'pending'

  if (lineStates.some((s) => s === 'pending')) return 'pending'
  if (lineStates.some((s) => s === 'paid')) return 'paid'
  if (lineStates.some((s) => s === 'escrow_held')) return 'escrow_held'
  if (lineStates.some((s) => s === 'redeemed')) return 'redeemed'

  // Every line is settled from here on.
  if (lineStates.every((s) => s === 'cancelled')) return 'cancelled'
  if (lineStates.every((s) => s === 'refunded' || s === 'cancelled')) return 'refunded'
  if (lineStates.some((s) => s === 'escrow_released')) return 'escrow_released'
  if (lineStates.some((s) => s === 'platform_settled')) return 'platform_settled'
  return 'split_executed'
}
