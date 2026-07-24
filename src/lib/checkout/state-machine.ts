/**
 * Typed state machines for checkout v1 (module 8/9).
 *
 * Order, payment, and coupon lifecycles as explicit transition maps. An illegal
 * transition throws `IllegalTransitionError` rather than silently corrupting
 * state, which is the whole point for a money system: e.g. `cancelled -> paid`
 * or a second redeem of a `used` coupon must be impossible in code, mirroring
 * the DB guards (order `paid_at` lock, coupon CAS + terminal-state trigger).
 *
 * Binding source: COMPLETE-SYSTEM-ARCHITECTURE.md §3 and CHECKOUT-COMPLETE.md §2.
 * Terminal states are absorbing: no transition leaves them.
 */

// --- shared ----------------------------------------------------------------

export class IllegalTransitionError extends Error {
  constructor(
    readonly machine: string,
    readonly from: string,
    readonly to: string,
  ) {
    super(`illegal ${machine} transition: ${from} -> ${to}`)
    this.name = 'IllegalTransitionError'
  }
}

type TransitionMap<S extends string> = Readonly<Record<S, readonly S[]>>

function makeMachine<S extends string>(name: string, transitions: TransitionMap<S>) {
  const states = Object.keys(transitions) as S[]
  const terminal = new Set(states.filter((s) => transitions[s].length === 0))

  /** True if `to` is reachable from `from` in one step. */
  function canTransition(from: S, to: S): boolean {
    return transitions[from]?.includes(to) ?? false
  }

  /** Return `to` if the transition is legal, else throw. */
  function assertTransition(from: S, to: S): S {
    if (!canTransition(from, to)) {
      throw new IllegalTransitionError(name, from, to)
    }
    return to
  }

  function isTerminal(state: S): boolean {
    return terminal.has(state)
  }

  return { name, states, canTransition, assertTransition, isTerminal } as const
}

// --- order (order_status) --------------------------------------------------

export type OrderStatus =
  | 'pending'
  | 'paid'
  | 'partially_fulfilled'
  | 'fulfilled'
  | 'cancelled'
  | 'refunded'

/**
 * pending --checkout_finalize--> paid
 * pending --expiry/cancel------> cancelled            [terminal]
 * paid --physical progress-----> partially_fulfilled
 * paid|partial --all done------> fulfilled
 * paid|partial|fulfilled --refund--> refunded         [terminal]
 */
export const orderMachine = makeMachine<OrderStatus>('order', {
  pending: ['paid', 'cancelled'],
  paid: ['partially_fulfilled', 'fulfilled', 'refunded'],
  partially_fulfilled: ['fulfilled', 'refunded'],
  fulfilled: ['refunded'],
  cancelled: [],
  refunded: [],
})

// --- payment (payment_status) ----------------------------------------------

export type PaymentStatus =
  | 'initiated'
  | 'redirected'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'refunded'

/**
 * initiated --LP created--> redirected
 * redirected --verified---> succeeded
 * redirected --decline----> failed                    [terminal]
 * initiated|redirected --user cancel--> cancelled      [terminal]
 * succeeded --refund confirmed--> refunded             [terminal]
 */
export const paymentMachine = makeMachine<PaymentStatus>('payment', {
  initiated: ['redirected', 'cancelled'],
  redirected: ['succeeded', 'failed', 'cancelled'],
  succeeded: ['refunded'],
  failed: [],
  cancelled: [],
  refunded: [],
})

// --- coupon (coupon_status) ------------------------------------------------

export type CouponStatus = 'issued' | 'used' | 'expired' | 'refunded'

/**
 * issued --redeem--> used         [terminal]
 * issued --expire--> expired      [terminal]
 * issued --refund--> refunded     [terminal]
 * All of used/expired/refunded are absorbing: no second redeem, no un-expire.
 */
export const couponMachine = makeMachine<CouponStatus>('coupon', {
  issued: ['used', 'expired', 'refunded'],
  used: [],
  expired: [],
  refunded: [],
})

// --- settlement batch (settlement_batch_status) ----------------------------

export type SettlementBatchStatus = 'draft' | 'pending_approval' | 'approved' | 'paid' | 'cancelled'

export const settlementBatchMachine = makeMachine<SettlementBatchStatus>('settlement_batch', {
  draft: ['pending_approval', 'cancelled'],
  pending_approval: ['approved', 'cancelled'],
  approved: ['paid', 'cancelled'],
  paid: [],
  cancelled: [],
})
