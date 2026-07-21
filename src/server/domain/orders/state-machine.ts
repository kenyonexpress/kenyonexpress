import type { CommissionProductType } from '@/lib/commerce/commission'

/**
 * Settlement lifecycle of an order line (and, derived, of an order).
 *
 * Physical happy path: pending -> paid -> split_executed
 * Coupon happy path:   pending -> paid -> escrow_held -> redeemed -> escrow_released
 * Failure paths:       pending -> cancelled; paid | escrow_held | split_executed -> refunded
 */
export type SettlementState =
  | 'pending'
  | 'paid'
  | 'split_executed'
  | 'escrow_held'
  | 'escrow_released'
  | 'redeemed'
  | 'refunded'
  | 'cancelled'

export type SettlementEvent =
  | 'PAYMENT_CONFIRMED'
  | 'EXECUTE_SPLIT'
  | 'HOLD_ESCROW'
  | 'REDEEM'
  | 'RELEASE_ESCROW'
  | 'REFUND'
  | 'CANCEL'

export const SETTLEMENT_STATES: readonly SettlementState[] = [
  'pending',
  'paid',
  'split_executed',
  'escrow_held',
  'escrow_released',
  'redeemed',
  'refunded',
  'cancelled',
]

export const SETTLEMENT_EVENTS: readonly SettlementEvent[] = [
  'PAYMENT_CONFIRMED',
  'EXECUTE_SPLIT',
  'HOLD_ESCROW',
  'REDEEM',
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
 * REFUND is NOT legal from redeemed / escrow_released: after redemption the
 * platform no longer holds the money.
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
    HOLD_ESCROW: { to: 'escrow_held', productType: 'coupon' },
    REFUND: { to: 'refunded' },
  },
  escrow_held: {
    REDEEM: { to: 'redeemed', productType: 'coupon' },
    REFUND: { to: 'refunded' },
  },
  redeemed: {
    RELEASE_ESCROW: { to: 'escrow_released', productType: 'coupon' },
  },
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

  // Every line is terminal from here on.
  if (lineStates.every((s) => s === 'cancelled')) return 'cancelled'
  if (lineStates.every((s) => s === 'refunded' || s === 'cancelled')) return 'refunded'
  if (lineStates.some((s) => s === 'escrow_released')) return 'escrow_released'
  return 'split_executed'
}
