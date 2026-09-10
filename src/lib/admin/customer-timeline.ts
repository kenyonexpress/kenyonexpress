/**
 * One customer's history, as a single list in time order.
 *
 * =========================================================================
 * WHY A MERGED LIST AND NOT FIVE PANELS
 * =========================================================================
 *
 * `/admin/users/[id]` already showed three panels: last 10 orders, the wallet
 * ledger, last 5 coupon codes. Three panels is three sorted lists, and the
 * question support is actually asked is not answerable from any one of them:
 *
 *   "I cancelled on Tuesday and I still have not got my money."
 *
 * The answer is the ORDER of things -- refund requested, then wallet credited,
 * then the mail that told them so -- and three panels each sorted by their own
 * `created_at` put those three facts in three different places on the page,
 * with no way to see that the mail went out before the credit landed.
 *
 * =========================================================================
 * WHY THIS FILE HOLDS NO DATABASE CALLS
 * =========================================================================
 *
 * Same split the rest of the money code uses (`planWalletCredit`,
 * `planOrderRefund`): the merge and the ordering are decisions and are unit
 * tested; the five reads live in `server/queries/admin-customer.ts`. A merge
 * that can only be exercised by standing up five tables is a merge nobody
 * tests, and off-by-one ordering is exactly the bug that would survive.
 */

export type TimelineKind = 'order' | 'voucher' | 'refund' | 'wallet' | 'notification' | 'email'

export interface TimelineEvent {
  kind: TimelineKind
  /** Unique within its kind. `${kind}:${id}` is unique across the list. */
  id: string
  /** ISO 8601. The instant the event happened, not when the row was last touched. */
  at: string
  titleHe: string
  detailHe?: string | null
  /** Admin-panel destination, when the event has one worth opening. */
  href?: string | null
  /** Signed agorot: positive is money toward the customer. Null when not a money event. */
  amountAgorot?: number | null
  /** Raw status code, already translated by the caller when it had a label. */
  statusHe?: string | null
}

/**
 * The cap exists so a five-year customer does not render five thousand rows
 * into an admin page. It is applied AFTER the merge, never per source: capping
 * each source at N and then merging drops recent rows from a busy source in
 * favour of ancient rows from a quiet one, which is the one ordering mistake
 * that makes the page actively misleading.
 */
export const CUSTOMER_TIMELINE_CAP = 120

/**
 * One event, with its kind as a positional argument.
 *
 * TWO REASONS, and the second is not obvious. The first is repetition: the six
 * mappers in `server/queries/admin-customer.ts` each spelled `kind: 'order'`
 * and friends inside an object literal, which is six lines that say nothing the
 * surrounding function name did not.
 *
 * The second is that `lib/email/outbox-kinds.test.ts` scans every file naming
 * `notification_outbox` for `kind: '<literal>'` and requires each to be a value
 * the outbox CHECK constraint accepts. That gate is right -- it exists because
 * a rejected kind was enqueued in production on 2026-08-19 -- and the query
 * module legitimately reads that table, so its timeline kinds read as outbox
 * kinds and were reported as constraint violations. Passing the kind as an
 * argument is the honest fix; renaming the field to dodge the regex would have
 * been the dishonest one.
 */
export function timelineEvent(
  kind: TimelineKind,
  fields: Omit<TimelineEvent, 'kind'>,
): TimelineEvent {
  return { kind, ...fields }
}

export interface TimelineSources {
  orders?: readonly TimelineEvent[]
  vouchers?: readonly TimelineEvent[]
  refunds?: readonly TimelineEvent[]
  wallet?: readonly TimelineEvent[]
  notifications?: readonly TimelineEvent[]
  emails?: readonly TimelineEvent[]
}

/**
 * Newest first, capped, with unparseable timestamps sunk rather than dropped.
 *
 * A row whose `at` will not parse is a real row about a real customer. Dropping
 * it silently would make the page claim a thing did not happen; sorting it to
 * the bottom keeps it visible and puts it where it cannot displace anything
 * datable. `Number.NaN` compares false against everything, so the comparator
 * cannot be left to encounter one -- it would produce an order that depends on
 * the input order, which is the sort bug that only shows up in production.
 */
export function buildCustomerTimeline(
  sources: TimelineSources,
  cap: number = CUSTOMER_TIMELINE_CAP,
): TimelineEvent[] {
  const all = [
    ...(sources.orders ?? []),
    ...(sources.vouchers ?? []),
    ...(sources.refunds ?? []),
    ...(sources.wallet ?? []),
    ...(sources.notifications ?? []),
    ...(sources.emails ?? []),
  ]

  const keyed = all.map((event) => {
    const parsed = Date.parse(event.at)
    return { event, ms: Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY }
  })

  keyed.sort((a, b) => {
    if (a.ms !== b.ms) return b.ms - a.ms
    // Same instant: a stable, meaningful tiebreak rather than whichever source
    // happened to be spread first. A wallet credit and the mail announcing it
    // are frequently written in the same millisecond.
    const byKind = KIND_ORDER[a.event.kind] - KIND_ORDER[b.event.kind]
    if (byKind !== 0) return byKind
    return a.event.id.localeCompare(b.event.id)
  })

  return keyed.slice(0, Math.max(0, cap)).map((entry) => entry.event)
}

/**
 * Cause before effect, when the clock cannot tell them apart. An order exists
 * before the voucher it issued; the refund decision precedes the wallet credit
 * that carries it out; the mail is always the last thing that happens.
 */
const KIND_ORDER: Record<TimelineKind, number> = {
  order: 0,
  refund: 1,
  voucher: 2,
  wallet: 3,
  notification: 4,
  email: 5,
}

export const TIMELINE_KIND_LABELS: Record<TimelineKind, string> = {
  order: 'הזמנה',
  voucher: 'שובר',
  refund: 'החזר',
  wallet: 'ארנק',
  notification: 'התראה',
  email: 'מייל',
}

/** How many of each kind the merged list ended up holding, for the page header. */
export function timelineCounts(events: readonly TimelineEvent[]): Record<TimelineKind, number> {
  const counts: Record<TimelineKind, number> = {
    order: 0,
    voucher: 0,
    refund: 0,
    wallet: 0,
    notification: 0,
    email: 0,
  }
  for (const event of events) counts[event.kind] += 1
  return counts
}
