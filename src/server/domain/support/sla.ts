/**
 * Support SLA: what we promise, and when we have broken it.
 *
 * DERIVED, NEVER STORED. A due time written into a row is computed once under
 * whatever policy was in force that day, and is then wrong for every row the
 * moment the targets change - and it cannot be recomputed, because the policy
 * that produced it was not stored beside it. So the only timestamps in the
 * database are the FACTS (`created_at`, `first_response_at`, `closed_at`) and
 * everything else is worked out here, in one place, from a table that
 * `docs/SUPPORT.md` restates and a test compares against.
 *
 * The contrast worth naming is `disputes.respond_by` in 202, which IS a stored
 * column. That deadline is set by the acquirer and we are only recording what
 * somebody else decided; this one is our own promise, and our own promise is
 * exactly the kind that gets revised.
 *
 * THE CLOCK STOPS ON `waiting_customer`, AND THAT IS THE WHOLE POINT OF THAT
 * STATUS. Counting the hours a customer takes to answer as our breach makes
 * the number measure the customer rather than us, and the predictable response
 * to a metric like that is to stop asking clarifying questions.
 *
 * BUSINESS HOURS ARE NOT MODELLED, on purpose. This shop has no published
 * opening hours anywhere in the codebase, and inventing a 09:00-18:00 Sunday
 * to Thursday here would make every target a fiction that looks precise. The
 * targets below are wall-clock hours and are set generously BECAUSE of that:
 * they are honest about being crude rather than precise about being wrong.
 */

export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent'
export type TicketStatus = 'open' | 'pending' | 'waiting_customer' | 'resolved' | 'closed'

export type SlaTarget = {
  /** Hours from creation in which a human must say something. */
  firstResponseHours: number
  /** Hours from creation in which the ticket should be resolved or closed. */
  resolutionHours: number
  /** Why this row is what it is. Prose, because a bare number says nothing. */
  reason: string
}

/**
 * WALL-CLOCK HOURS, and every number is set from what a customer is actually
 * waiting on rather than from a support-desk convention.
 */
export const SLA_TARGETS: Record<TicketPriority, SlaTarget> = {
  urgent: {
    firstResponseHours: 2,
    resolutionHours: 8,
    reason: 'money is stuck or a voucher failed at the counter with the customer standing there',
  },
  high: {
    firstResponseHours: 6,
    resolutionHours: 24,
    reason: 'a paid order is wrong, or a voucher expires within the week',
  },
  normal: {
    firstResponseHours: 24,
    resolutionHours: 72,
    reason: 'the ordinary question, answered inside a working day',
  },
  low: {
    firstResponseHours: 72,
    resolutionHours: 168,
    reason: 'general enquiries and supplier interest, where nobody is blocked',
  },
}

/** Statuses whose clock is not running. */
const PAUSED: ReadonlySet<TicketStatus> = new Set(['waiting_customer'])
const FINISHED: ReadonlySet<TicketStatus> = new Set(['resolved', 'closed'])

export type SlaState = {
  firstResponseDueAt: Date
  resolutionDueAt: Date
  /** Null once the ticket is finished or paused: nothing is counting down. */
  minutesToFirstResponse: number | null
  minutesToResolution: number | null
  firstResponseBreached: boolean
  resolutionBreached: boolean
  /** True when either target is missed and the ticket is still ours to answer. */
  breached: boolean
  paused: boolean
}

const HOUR_MS = 60 * 60 * 1000

export function slaState(input: {
  createdAt: string | Date
  firstResponseAt: string | Date | null
  status: TicketStatus
  priority: TicketPriority
  now: Date
}): SlaState {
  const target = SLA_TARGETS[input.priority] ?? SLA_TARGETS.normal
  const created = toDate(input.createdAt) ?? input.now
  const responded = toDate(input.firstResponseAt)

  const firstResponseDueAt = new Date(created.getTime() + target.firstResponseHours * HOUR_MS)
  const resolutionDueAt = new Date(created.getTime() + target.resolutionHours * HOUR_MS)

  const paused = PAUSED.has(input.status)
  const finished = FINISHED.has(input.status)

  // A first response either happened by its deadline or it did not, and that
  // stays true after the fact: a ticket answered late is a breach in the record
  // for ever, not a breach that clears when somebody finally replies.
  const firstResponseBreached = responded
    ? responded > firstResponseDueAt
    : !paused && input.now > firstResponseDueAt

  // Resolution, by contrast, only breaches while the ticket is still open. A
  // closed one is judged on when it closed, which we do not have separately
  // from `closed_at` - so a finished ticket is reported as not breaching here
  // and the queue never shows it.
  const resolutionBreached = !finished && !paused && input.now > resolutionDueAt

  const counting = !finished && !paused

  return {
    firstResponseDueAt,
    resolutionDueAt,
    minutesToFirstResponse:
      counting && !responded ? minutesBetween(input.now, firstResponseDueAt) : null,
    minutesToResolution: counting ? minutesBetween(input.now, resolutionDueAt) : null,
    firstResponseBreached,
    resolutionBreached,
    breached: firstResponseBreached || resolutionBreached,
    paused,
  }
}

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/** Negative when the deadline has passed, which is what the queue renders. */
function minutesBetween(now: Date, due: Date): number {
  return Math.round((due.getTime() - now.getTime()) / 60_000)
}

/**
 * The priority a ticket opens at, from what it is about.
 *
 * A SUGGESTION THE OPERATOR CAN OVERRIDE, not a classification. Nothing here
 * reads the customer's prose - there is no classifier, and one that guessed
 * "urgent" from an exclamation mark would be trained by customers within a
 * week. It reads the CHANNEL and CATEGORY, which are structural facts about
 * where the ticket came from.
 */
export function suggestedPriority(input: {
  channel: string
  category: string | null
}): TicketPriority {
  // Somebody at a counter, right now, whose voucher will not scan.
  if (input.category === 'voucher_problem') return 'urgent'
  // Money that has left the customer and not arrived where they expected.
  if (input.category === 'payment' || input.category === 'refund') return 'high'
  if (input.channel === 'return_request') return 'high'
  if (input.channel === 'order_help') return 'normal'
  if (input.category === 'supplier') return 'low'
  return 'normal'
}

/** Hebrew, for the queue and the customer's own ticket page. */
export const STATUS_LABELS: Record<TicketStatus, string> = {
  open: 'נפתחה',
  pending: 'בטיפול',
  waiting_customer: 'ממתינה לתשובתכם',
  resolved: 'נפתרה',
  closed: 'נסגרה',
}

export const PRIORITY_LABELS: Record<TicketPriority, string> = {
  urgent: 'דחוף',
  high: 'גבוה',
  normal: 'רגיל',
  low: 'נמוך',
}
