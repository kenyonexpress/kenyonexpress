import { type OrderStatus, orderMachine } from '@/lib/checkout/state-machine'

/**
 * The order-level lifecycle, one layer above the raw legality tables.
 *
 * Three places already agree on WHICH moves `orders.status` may make:
 * `orderMachine` (what new code writes), `status-transitions.json` (what the
 * DB guard in migrations/pending/137 enforces, a superset that also admits the
 * legacy `platform_settled` rows), and the migration itself. This module adds
 * the two things none of them carry:
 *
 * 1. WHAT HAPPENS on each move: a declarative effect plan per edge, so every
 *    writer of a transition runs the same side effects instead of each call
 *    site remembering its own subset. The plan is data, not callbacks, so it
 *    is testable without a database and the executor (the action layer)
 *    decides how each effect touches the world.
 * 2. WHO may force a move by hand. Fulfilment progress is an operational fact
 *    an admin is allowed to assert; money states are not. `paid` exists only
 *    when a charge really succeeded (finalize.ts) and `refunded` only when
 *    money really moved back (the refund console). An override that writes
 *    either would make the ledger lie, so the policy forbids them regardless
 *    of what the machine allows.
 */

export type OrderTransitionKey = `${OrderStatus}->${OrderStatus}`

export type OrderTransitionEffect =
  /** Stamp `paid_at`. Owned by finalize.ts; listed so the plan is total. */
  | 'stamp_paid_at'
  /** Release the stock reservation now instead of waiting out the hold. */
  | 'release_stock'
  /** Append an attributed, dated line to `orders.notes` saying why. */
  | 'append_note'
  /**
   * The move is only real if money moved. It must arrive via the payment or
   * refund flow, which performs the movement itself; a bare status write is
   * forbidden.
   */
  | 'money_flow_only'
  /**
   * Return CONSUMED stock to the shelf (`restock_order_stock`, migration 223).
   * Owned by the refund console: consume really decremented the level at
   * payment, so undoing a paid order must really increment it back. Distinct
   * from `release_stock`, which only stamps a hold that never touched the
   * level.
   */
  | 'restock_consumed'

/**
 * One entry per legal edge of `orderMachine`, no more and no fewer;
 * `order-transitions.test.ts` fails the moment the two tables drift.
 */
export const ORDER_TRANSITION_EFFECTS: Readonly<
  Partial<Record<OrderTransitionKey, readonly OrderTransitionEffect[]>>
> = {
  'pending->paid': ['stamp_paid_at', 'money_flow_only'],
  'pending->cancelled': ['append_note', 'release_stock'],
  'paid->partially_fulfilled': ['append_note'],
  'paid->fulfilled': ['append_note'],
  'paid->refunded': ['money_flow_only', 'restock_consumed'],
  'partially_fulfilled->fulfilled': ['append_note'],
  'partially_fulfilled->refunded': ['money_flow_only', 'restock_consumed'],
  'fulfilled->refunded': ['money_flow_only', 'restock_consumed'],
}

export function transitionKey(from: OrderStatus, to: OrderStatus): OrderTransitionKey {
  return `${from}->${to}`
}

/**
 * The effect plan for a move, or null when the machine forbids the move
 * entirely. A legal edge always has a plan; the test enforces the totality.
 */
export function effectsFor(
  from: OrderStatus,
  to: OrderStatus,
): readonly OrderTransitionEffect[] | null {
  if (!orderMachine.canTransition(from, to)) return null
  return ORDER_TRANSITION_EFFECTS[transitionKey(from, to)] ?? []
}

/**
 * May an admin assert this move by hand?
 *
 * Legal in the machine AND not a money fact. This is why the override screen
 * can never fabricate a payment or erase a refund: the same rule the action
 * enforces server-side decides which targets the page offers at all.
 */
export function canAdminOverride(from: OrderStatus, to: OrderStatus): boolean {
  const effects = effectsFor(from, to)
  return effects !== null && !effects.includes('money_flow_only')
}

/** The targets the override UI should offer from a given state. */
export function adminOverridableTargets(from: OrderStatus): readonly OrderStatus[] {
  return orderMachine.states.filter((to) => canAdminOverride(from, to))
}
