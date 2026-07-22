/**
 * Customer/payment order lifecycle (ARCHITECTURE-CHECKOUT.md §2).
 * Settlement/escrow after `paid` stays in state-machine.ts (ADR-002).
 */

export type OrderLifecycleStatus = 'pending' | 'paid' | 'fulfilled' | 'refunded' | 'cancelled'

export type OrderLifecycleEvent = 'PAYMENT_SUCCEEDED' | 'FULFILL' | 'REFUND' | 'CANCEL' | 'EXPIRE'

export const ORDER_LIFECYCLE_STATUSES: readonly OrderLifecycleStatus[] = [
  'pending',
  'paid',
  'fulfilled',
  'refunded',
  'cancelled',
]

type TransitionMap = Readonly<
  Record<OrderLifecycleStatus, Partial<Record<OrderLifecycleEvent, OrderLifecycleStatus>>>
>

const TRANSITIONS: TransitionMap = {
  pending: {
    PAYMENT_SUCCEEDED: 'paid',
    CANCEL: 'cancelled',
    EXPIRE: 'cancelled',
  },
  paid: {
    FULFILL: 'fulfilled',
    REFUND: 'refunded',
  },
  fulfilled: {
    REFUND: 'refunded',
  },
  refunded: {},
  cancelled: {},
}

export type LifecycleTransitionErrorCode = 'ILLEGAL_TRANSITION'

export class LifecycleTransitionError extends Error {
  readonly code: LifecycleTransitionErrorCode = 'ILLEGAL_TRANSITION'
  readonly from: OrderLifecycleStatus
  readonly event: OrderLifecycleEvent

  constructor(from: OrderLifecycleStatus, event: OrderLifecycleEvent) {
    super(`ILLEGAL_TRANSITION: ${event} from ${from}`)
    this.name = 'LifecycleTransitionError'
    this.from = from
    this.event = event
  }
}

export function canLifecycleTransition(
  from: OrderLifecycleStatus,
  event: OrderLifecycleEvent,
): boolean {
  return TRANSITIONS[from][event] !== undefined
}

export function transitionLifecycle(
  from: OrderLifecycleStatus,
  event: OrderLifecycleEvent,
): OrderLifecycleStatus {
  const to = TRANSITIONS[from][event]
  if (!to) throw new LifecycleTransitionError(from, event)
  return to
}

export function isLifecycleTerminal(status: OrderLifecycleStatus): boolean {
  return Object.keys(TRANSITIONS[status]).length === 0
}

/** Maps foundation lifecycle onto legacy public.order_status enum values. */
export function toLegacyOrderStatus(
  status: OrderLifecycleStatus,
): 'pending' | 'paid' | 'fulfilled' | 'cancelled' | 'refunded' {
  return status
}
