/**
 * Settlement lifecycle of an order line, and, derived, of an order.
 *
 * THE MODEL, AND WHAT THIS COMMENT USED TO SAY.
 *
 * A coupon prepayment is NOT held for the supplier. The customer pays the
 * admin-set absolute `coupon_price` on the site, and 100% of that charge stays
 * with the platform permanently. The balance is collected by the business at
 * the counter, in cash, and never enters the platform. Scanning the voucher
 * moves no money.
 *
 * This docstring previously described the opposite -- "C11 version (b) ... a
 * coupon prepayment is held for the supplier until the voucher is scanned" --
 * and gave the coupon happy path as
 * `pending -> paid -> escrow_held -> escrow_released`. Neither state has
 * existed in `SettlementState` for some time, and the TRANSITIONS table below
 * has never contained them, so the comment contradicted the code eight lines
 * under it and contradicted its own closing paragraph. The code was right.
 *
 * Physical happy path: pending -> paid -> split_executed
 *   The whole charge splits the moment the order is paid, by the per-product
 *   platform_percent snapshotted onto the order line.
 *
 * Coupon happy path:   pending -> paid -> split_executed
 *   The same states, because the same event happened: the split occurred. Only
 *   the percentages differ. A coupon line splits 100/0, so
 *   commission_agorot == paid_on_site_agorot and supplier_immediate_agorot is
 *   zero. There is deliberately no state between `paid` and settled, because
 *   nothing is deferred and nothing is held.
 *
 * Failure paths: pending -> cancelled; paid | split_executed -> refunded.
 *
 * Every state here is a live `settlement_status` enum value. The database enum
 * carries nine; this type declares the six that are reachable. The other three
 * are dead, for three different reasons, and rows written before the model
 * changed can still hold them:
 *
 *   escrow_held, escrow_released - the ABOLISHED escrow model. Nothing writes
 *     them and nothing may. `server/queries/orders.ts` maps both forward to
 *     `split_executed` when reading old rows, because both meant "the money
 *     question for this line is closed".
 *   platform_settled - written by the abolished C11(a) rule, under which the
 *     platform kept the whole prepayment and the supplier got nothing. There is
 *     deliberately no event leading INTO it: it is a state this machine can
 *     only exit, which is what "legacy, no new row enters it" looks like when
 *     written as code rather than as a comment. Zero rows carry it.
 *   redeemed - the pre-voucher coupon_codes model recorded consumption on the
 *     LINE rather than on the voucher. Consumption now lives on the voucher.
 *     Terminal.
 *
 * The write path this mirrors: finalize.ts issues one voucher per unit and
 * settles the coupon line immediately, because the whole prepayment is platform
 * revenue the moment it is charged.
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
 * No transition is product-type specific, and the machine no longer takes a
 * product type. It carried a `productType` rule field and a WRONG_PRODUCT_TYPE
 * error from the C11(a) escrow rule, where coupon lines had their own path.
 * C11(b) removed that: both types run pending -> paid -> split_executed, and a
 * coupon line simply splits 100/0. No rule ever set the field again, so the
 * guard was unreachable in every state and every event, which is why the
 * per-file branch floor could not be met while it stood. Type-specific money
 * still exists, but it lives in platform_percent, not in the legal moves.
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
