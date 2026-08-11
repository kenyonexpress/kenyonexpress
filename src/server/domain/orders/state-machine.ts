import type { CommissionProductType } from '@/lib/commerce/commission'

/**
 * Settlement lifecycle of an order line (and, derived, of an order), under
 * C11 version (b), decided 2026-07-27: a coupon prepayment is held for the
 * supplier until the voucher is scanned.
 *
 * Physical happy path: pending -> paid -> split_executed
 *   (the whole charge splits the moment the order is paid)
 * Coupon happy path:   pending -> paid -> escrow_held -> escrow_released
 *   (the platform keeps platform_percent of the prepayment at paid-time; the
 *   remainder is held per voucher and released by the same transaction that
 *   redeems it, once no voucher of the line is still outstanding)
 * Failure paths: pending -> cancelled;
 *   paid | escrow_held | split_executed -> refunded
 *
 * Every state here is a live `settlement_status` enum value, verified against
 * the hosted project. Two of them are LEGACY and no new row enters them:
 *
 *   platform_settled - written by the abolished C11(a) rule, under which the
 *     platform kept the whole prepayment and the supplier got nothing. Kept
 *     refundable so such a row can still be unwound. Zero rows carry it.
 *   redeemed - the pre-voucher coupon_codes model recorded consumption on the
 *     line rather than on the voucher. Terminal, like escrow_released.
 *
 * The write path this mirrors: finalize.ts issues vouchers and settles the
 * coupon line immediately, because the whole prepayment is platform revenue
 * the moment it is charged. Nothing is deferred and nothing is held, so there
 * is no state between paid and settled.
 */
export type SettlementState =
  | 'pending'
  | 'paid'
  | 'split_executed'
  | 'redeemed'
  | 'refunded'
  | 'cancelled'

export type SettlementEvent = 'PAYMENT_CONFIRMED' | 'EXECUTE_SPLIT' | 'REFUND' | 'CANCEL'

export const SETTLEMENT_STATES: readonly SettlementState[] = [
  'pending',
  'paid',
  'split_executed',
  'redeemed',
  'refunded',
  'cancelled',
]

export const SETTLEMENT_EVENTS: readonly SettlementEvent[] = [
  'PAYMENT_CONFIRMED',
  'EXECUTE_SPLIT',
  'REFUND',
  'CANCEL',
]

type TransitionRule = {
  to: SettlementState
}

/**
 * Single source of truth for legal transitions.
 *
 * REFUND from split_executed covers physical returns inside the legal window
 * (money recovery from the supplier happens via payout adjustments).
 * REFUND from escrow_held is legal only while every voucher of the line is
 * still `issued`; the refund planner checks the voucher states, and the hold
 * itself is unwound by refund_vouchers_for_order().
 * escrow_released and redeemed cannot be refunded to the card: the value was
 * consumed at the business, and the supplier has already been paid out of the
 * hold. A goodwill refund after that point is a wallet credit, which is a
 * different money movement entirely.
 *
 * There is deliberately no event leading INTO platform_settled. It is a state
 * this machine can only exit, which is what "legacy, no new row enters it"
 * means when written as code rather than as a comment.
 */
const TRANSITIONS: Readonly<
  Record<SettlementState, Partial<Record<SettlementEvent, TransitionRule>>>
> = {
  pending: {
    PAYMENT_CONFIRMED: { to: 'paid' },
    CANCEL: { to: 'cancelled' },
  },
  paid: {
    // Both types land in split_executed. A physical line splits by the
    // per-product platform_percent; a coupon line "splits" 100/0, because the
    // platform keeps the whole prepayment and the supplier collects their part
    // in cash at the counter.
    EXECUTE_SPLIT: { to: 'split_executed' },
    REFUND: { to: 'refunded' },
  },
  redeemed: {},
  split_executed: {
    REFUND: { to: 'refunded' },
  },
  refunded: {},
  cancelled: {},
}

/**
 * Only one code. There used to be a second, `WRONG_PRODUCT_TYPE`, guarding a
 * `productType` field on TransitionRule that no rule ever set: under C11(b)
 * both product types share every transition, so the guard could not fire and
 * nothing anywhere caught the error it named. A check that cannot fail is not a
 * safety net, it is a comment that reads like one, and on the settlement path
 * that is worse than nothing. If a per-type rule is ever needed, it comes back
 * with the transition that needs it and a test that proves it fires.
 */
export type TransitionErrorCode = 'ILLEGAL_TRANSITION'

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

/**
 * `productType` is still taken, and still ignored.
 *
 * Both types share every transition under C11(b), so it changes no answer
 * today. It stays in the signature because every caller has one to hand and
 * because the day a transition does diverge by type, the call sites are already
 * passing the thing the rule will need. Dropping it would mean threading it
 * back through refund.ts to add one rule.
 */
export function canTransition(
  from: SettlementState,
  event: SettlementEvent,
  _productType: CommissionProductType,
): boolean {
  return TRANSITIONS[from][event] !== undefined
}

/** Applies an event, throwing SettlementTransitionError when illegal. */
export function transition(
  from: SettlementState,
  event: SettlementEvent,
  _productType: CommissionProductType,
): SettlementState {
  const rule = TRANSITIONS[from][event]
  if (!rule) {
    throw new SettlementTransitionError('ILLEGAL_TRANSITION', from, event)
  }
  return rule.to
}

export function isTerminal(state: SettlementState): boolean {
  const events = TRANSITIONS[state]
  return Object.keys(events).length === 0
}

/** States in which the platform no longer owes anyone money for the line. */
export function isSettled(state: SettlementState): boolean {
  return state === 'split_executed' || state === 'refunded' || state === 'cancelled'
}

/**
 * Order-level rollup from line states, in the same enum.
 * The order shows the least-advanced ACTIVE line; once every line is settled,
 * the dominant settlement outcome wins.
 */
export function deriveOrderStatus(lineStates: readonly SettlementState[]): SettlementState {
  if (lineStates.length === 0) return 'pending'

  if (lineStates.some((s) => s === 'pending')) return 'pending'
  if (lineStates.some((s) => s === 'paid')) return 'paid'
  if (lineStates.some((s) => s === 'redeemed')) return 'redeemed'

  // Every line is settled from here on.
  if (lineStates.every((s) => s === 'cancelled')) return 'cancelled'
  if (lineStates.every((s) => s === 'refunded' || s === 'cancelled')) return 'refunded'
  return 'split_executed'
}
