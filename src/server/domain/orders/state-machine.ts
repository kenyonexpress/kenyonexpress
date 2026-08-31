/**
 * Settlement lifecycle of an order line (and, derived, of an order).
 *
 * THERE IS NO ESCROW. That is the authoritative business rule (STATE.md,
 * MISSION-FINAL.md, src/server/payments/README.md): the customer pays the
 * absolute `coupon_price` on the site, ALL of it stays with the platform
 * permanently, and the supplier collects the remaining balance in cash from
 * the customer at the counter when the voucher is scanned. No coupon money is
 * ever held for a supplier and none is ever paid out to one.
 *
 * Physical happy path: pending -> paid -> split_executed
 *   (the charge splits by the per-product platform_percent snapshotted into
 *   order_items, the moment the order is paid)
 * Coupon happy path:   pending -> paid -> split_executed
 *   (the same two moves, splitting 100/0: platform keeps everything)
 * Failure paths: pending -> cancelled; paid | split_executed -> refunded
 *
 * THE STATES THIS FILE DELIBERATELY DOES NOT DECLARE. The hosted
 * `settlement_status` enum still carries `escrow_held`, `escrow_released` and
 * `platform_settled`, because dropping a Postgres enum value is not a thing
 * you do to a production database over a rule change. They are absent from
 * `SettlementState` on purpose: a value the type does not admit is a row this
 * code can never write. `platform_settled` survives only in the redemption
 * read path (`REDEEMABLE_SETTLEMENT_STATUSES`), which has to keep recognising
 * rows written before the rule changed.
 *
 * `redeemed` is kept and is terminal: the pre-voucher coupon_codes model
 * recorded consumption on the line rather than on the voucher, and those rows
 * still exist.
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
 * REFUND from split_executed covers both types inside the legal window: a
 * physical return (money recovery from the supplier happens via payout
 * adjustments) and a coupon cancelled while every voucher of the line is still
 * `issued`. The refund planner is what checks those voucher states; this
 * machine only says the move is legal at all.
 *
 * `redeemed` cannot be refunded to the card: the value was consumed at the
 * business. A goodwill refund after that point is a wallet credit, which is a
 * different money movement entirely.
 *
 * No transition is product-type specific, and the machine no longer takes a
 * product type. It carried a `productType` rule field and a WRONG_PRODUCT_TYPE
 * error from the C11(a) escrow rule, where coupon lines had their own path.
 * C11(b) removed that: both types run pending -> paid -> split_executed, and a
 * coupon line simply splits 100/0. No rule ever set the field again, so the
 * guard was unreachable in every state and every event, which is why the
 * per-file branch floor could not be met while it stood. Type-specific money
 * still exists, but it lives in platform_percent, not in the legal moves.
 *
 * There is deliberately no event leading INTO platform_settled, escrow_held or
 * escrow_released, and no state for them either: a legacy enum value that the
 * type does not admit is one no transition can ever produce, which is what
 * "abolished, no new row enters it" means written as code rather than as a
 * comment.
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

export function canTransition(from: SettlementState, event: SettlementEvent): boolean {
  return TRANSITIONS[from][event] !== undefined
}

/** Applies an event, throwing SettlementTransitionError when illegal. */
export function transition(from: SettlementState, event: SettlementEvent): SettlementState {
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
