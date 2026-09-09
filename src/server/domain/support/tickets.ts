import type { TicketStatus } from '@/server/domain/support/sla'

/**
 * What a message does to the ticket it lands on.
 *
 * PURE, AND THE REASON IT IS PURE IS THE REOPEN RULE. "A customer who replies
 * to a closed ticket reopens it" is one sentence and three consequences -
 * status, `closed_at`, and the SLA clock restarting - and the database CHECK
 * from 203 refuses `closed` without `closed_at` and `closed_at` without
 * `closed`. Deciding those three in a function that can be tested as a table
 * is what keeps a support reply from failing on a constraint violation in front
 * of a customer.
 */

export type MessageDirection = 'inbound' | 'outbound' | 'internal'

export type TicketTransition = {
  status: TicketStatus
  /** Null clears the column; undefined leaves it alone. */
  closedAt: string | null | undefined
  /** Set only on the FIRST outbound message, and never overwritten. */
  firstResponseAt: string | undefined
  /** Set on every inbound message. */
  lastCustomerMessageAt: string | undefined
  /** True when this message brought a finished ticket back to life. */
  reopened: boolean
}

export function applyMessage(input: {
  currentStatus: TicketStatus
  direction: MessageDirection
  hasFirstResponse: boolean
  at: Date
}): TicketTransition {
  const at = input.at.toISOString()

  // An internal note is a note between operators. It changes nothing: it is not
  // an answer to the customer, so it must not stop the first-response clock,
  // and treating it as one is the single easiest way to make an SLA report
  // flattering and false.
  if (input.direction === 'internal') {
    return {
      status: input.currentStatus,
      closedAt: undefined,
      firstResponseAt: undefined,
      lastCustomerMessageAt: undefined,
      reopened: false,
    }
  }

  if (input.direction === 'inbound') {
    const wasFinished = input.currentStatus === 'resolved' || input.currentStatus === 'closed'
    return {
      // Back to `open` rather than `pending`: a reopened ticket has not been
      // picked up by anybody yet, and landing it in `pending` would hide it
      // from a queue filtered on what nobody has touched.
      status: 'open',
      // Cleared, because 203 refuses `closed_at` on a ticket that is not
      // closed. Undefined when it was already null, so an ordinary reply does
      // not write a column it is not changing.
      closedAt: input.currentStatus === 'closed' ? null : undefined,
      firstResponseAt: undefined,
      lastCustomerMessageAt: at,
      reopened: wasFinished,
    }
  }

  // Outbound: we have answered, so the ball is with the customer and the clock
  // stops. NOT `resolved` - claiming a ticket is solved because somebody typed
  // into it is the kind of default that makes a resolution rate meaningless.
  return {
    status: 'waiting_customer',
    closedAt: input.currentStatus === 'closed' ? null : undefined,
    // Only when there was not one. A first response that moves every time
    // somebody replies is not a first response.
    firstResponseAt: input.hasFirstResponse ? undefined : at,
    lastCustomerMessageAt: undefined,
    reopened: input.currentStatus === 'closed' || input.currentStatus === 'resolved',
  }
}

/**
 * May the customer still write into this ticket?
 *
 * YES ON EVERY STATUS, INCLUDING CLOSED, and that is deliberate. The
 * alternative - a closed ticket that refuses replies - forces somebody with one
 * more question to open a second ticket carrying none of the history, which
 * costs the operator the context and the customer the explanation. Reopening is
 * cheaper for both. The bound on abuse is the rate limit, not the status.
 */
export function customerMayReply(_status: TicketStatus): boolean {
  return true
}

/** The transitions an operator may make by hand, from each status. */
const OPERATOR_MOVES: Record<TicketStatus, TicketStatus[]> = {
  open: ['pending', 'waiting_customer', 'resolved', 'closed'],
  pending: ['open', 'waiting_customer', 'resolved', 'closed'],
  waiting_customer: ['open', 'pending', 'resolved', 'closed'],
  // A resolved ticket can be reopened by an operator who was wrong, or closed
  // for good. It cannot go back to `waiting_customer` without a message, which
  // is what `applyMessage` is for.
  resolved: ['open', 'closed'],
  closed: ['open'],
}

export function operatorMayMove(from: TicketStatus, to: TicketStatus): boolean {
  return OPERATOR_MOVES[from]?.includes(to) ?? false
}

/** The `closed_at` value that goes with a hand-made status change. */
export function closedAtFor(to: TicketStatus, at: Date): string | null {
  return to === 'closed' ? at.toISOString() : null
}
