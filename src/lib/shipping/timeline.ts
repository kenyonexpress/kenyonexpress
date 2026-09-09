/**
 * The five steps a physical order walks, and the honest answer for each.
 *
 * WHAT THE CUSTOMER HAD BEFORE THIS
 *
 * `/account/orders/[id]` printed the seven characters " · נשלח" beside a line
 * and nothing else. There was no "when", no "what happens next", and no way to
 * tell a parcel that left this morning from one that left nine days ago. The
 * shipped email raised the question; the page answered with one word.
 *
 * THE FIVE STEPS ARE NOT THE FIVE ENUM VALUES, AND PRETENDING THEY WERE WOULD
 * HAVE COST A MIGRATION FOR NOTHING
 *
 * `order_item_status` in production is pending / issued / shipped / delivered /
 * cancelled / refunded. There is no `confirmed` and no `packed`, and adding
 * them would mean an ALTER TYPE that sits in `migrations/pending` awaiting
 * approval -- which would leave this page unbuildable until somebody applies
 * it. So the steps are DERIVED from data that already exists:
 *
 *   placed    <- orders.created_at        (always known)
 *   confirmed <- orders.paid_at           (the credit-card approval)
 *   packed    <- no timestamp exists      (see below)
 *   shipped   <- order_items.shipped_at
 *   delivered <- order_items.delivered_at
 *
 * `packed` IS REPORTED WITHOUT A TIME, DELIBERATELY
 *
 * Nothing in this system records when a supplier boxed a parcel. The choice was
 * between dropping the step, inventing a timestamp for it, or showing it
 * undated. Inventing one is the worst of the three: "נארז 09.09 14:32" that no
 * human typed is a lie the customer will quote back at support. Dropping it
 * hides the phase the customer is actually IN for most of the wait -- paid,
 * not yet moving -- which is precisely when people ask where their order is. So
 * the step is shown, marked current while the line is paid and unshipped, and
 * carries `at: null`. Once a line ships, `packed` is known to have happened and
 * is marked done, still undated.
 *
 * ONE ORDER, MANY PARCELS: THE TIMELINE TAKES THE EARLIEST-BEHIND LINE
 *
 * A normal order here mixes suppliers, and suppliers ship separately. An order
 * whose three lines are delivered/shipped/pending is not "delivered". The
 * order-level step is the LEAST advanced physical line, because that is what
 * the customer is still waiting on, and per-line detail lives beside it.
 *
 * CANCELLED AND REFUNDED LINES ARE NOT PART OF THE WAIT
 *
 * They are excluded from the "least advanced" computation. Otherwise one
 * refunded line would peg an otherwise-delivered order at its own dead state
 * forever.
 */

export type TimelineStepId = 'placed' | 'confirmed' | 'packed' | 'shipped' | 'delivered'

export type TimelineStepState = 'done' | 'current' | 'upcoming'

export interface TimelineStep {
  id: TimelineStepId
  /** What the customer reads. */
  labelHe: string
  /** One line of context, or null when the label says it all. */
  detailHe: string | null
  state: TimelineStepState
  /** ISO timestamp, or null when the step is not dated (see the header). */
  at: string | null
}

export const STEP_ORDER: readonly TimelineStepId[] = [
  'placed',
  'confirmed',
  'packed',
  'shipped',
  'delivered',
]

const LABELS: Record<TimelineStepId, string> = {
  placed: 'ההזמנה התקבלה',
  confirmed: 'התשלום אושר',
  packed: 'בהכנה אצל הספק',
  shipped: 'יצאה למשלוח',
  delivered: 'נמסרה',
}

/** Lines in these states are not something the customer is waiting for. */
const DEAD_STATES = new Set(['cancelled', 'refunded'])

export interface TimelineLine {
  itemStatus: string
  productType: string
  shippedAt: string | null
  deliveredAt: string | null
}

export interface TimelineInput {
  orderCreatedAt: string
  orderPaidAt: string | null
  orderStatus: string
  lines: readonly TimelineLine[]
}

export interface OrderTimeline {
  steps: TimelineStep[]
  /** The step the order is sitting on now. */
  currentStep: TimelineStepId
  /**
   * True when there is no physical line to track at all -- a coupon-only order.
   * The caller shows the voucher path instead of a parcel timeline.
   */
  physicalLines: number
}

/** How far one line has walked, as an index into STEP_ORDER. */
function lineProgress(line: TimelineLine): number {
  if (line.itemStatus === 'delivered') return 4
  if (line.itemStatus === 'shipped') return 3
  return 2 // paid and packed-or-packing; `placed`/`confirmed` are order-level
}

function earliest(values: readonly (string | null)[]): string | null {
  const present = values.filter((v): v is string => typeof v === 'string' && v.length > 0)
  if (present.length === 0) return null
  return present.reduce((min, v) => (v < min ? v : min))
}

function latest(values: readonly (string | null)[]): string | null {
  const present = values.filter((v): v is string => typeof v === 'string' && v.length > 0)
  if (present.length === 0) return null
  return present.reduce((max, v) => (v > max ? v : max))
}

export function buildOrderTimeline(input: TimelineInput): OrderTimeline {
  const physical = input.lines.filter((l) => l.productType === 'physical')
  const live = physical.filter((l) => !DEAD_STATES.has(l.itemStatus))

  const paid = input.orderPaidAt

  /**
   * The order-level position. Un-paid stops at `placed`; paid with no live
   * physical line left stops at `confirmed`, because there is nothing in
   * motion to describe.
   */
  let progress: number
  if (!paid) progress = 0
  else if (live.length === 0) progress = 1
  else progress = Math.min(...live.map(lineProgress))

  /**
   * The shipped stamp of the LAST line to leave, and the delivered stamp of the
   * last to arrive. Not the earliest: the step is only complete when every live
   * line has passed it, so the time it completed is the last one's.
   *
   * When a line carries the status but no timestamp -- possible for rows shipped
   * before 155 gave the columns their stamps -- the step still shows as done and
   * simply has no time. A missing stamp must not un-ship a parcel.
   */
  const shippedAt = live.every((l) => lineProgress(l) >= 3)
    ? latest(live.map((l) => l.shippedAt))
    : null
  const deliveredAt = live.every((l) => lineProgress(l) >= 4)
    ? latest(live.map((l) => l.deliveredAt))
    : null

  const times: Record<TimelineStepId, string | null> = {
    placed: input.orderCreatedAt,
    confirmed: paid,
    packed: null,
    shipped: shippedAt,
    delivered: deliveredAt,
  }

  const details: Record<TimelineStepId, string | null> = {
    placed: null,
    confirmed: paid ? null : 'ממתין לאישור התשלום.',
    // Said out loud rather than left as an empty slot, so nobody reads the
    // missing time as a bug or a stuck order.
    packed: 'שלב זה אינו מתועד בשעה מדויקת.',
    shipped:
      live.length > 1 && progress >= 3
        ? null
        : live.length > 1
          ? 'הזמנה עם כמה ספקים נשלחת בכמה חבילות.'
          : null,
    delivered: null,
  }

  const lastIndex = STEP_ORDER.length - 1

  const steps: TimelineStep[] = STEP_ORDER.map((id, index) => {
    // The last step is terminal: reaching it is arriving, not waiting on it.
    const state: TimelineStepState =
      index < progress || (index === progress && index === lastIndex)
        ? 'done'
        : index === progress
          ? 'current'
          : 'upcoming'
    return {
      id,
      labelHe: LABELS[id],
      // A note about a step nobody has reached yet is noise; it appears when
      // the step becomes relevant.
      detailHe: state === 'upcoming' ? null : details[id],
      state,
      at: index <= progress ? times[id] : null,
    }
  })

  return {
    steps,
    currentStep: STEP_ORDER[Math.min(progress, lastIndex)] as TimelineStepId,
    physicalLines: physical.length,
  }
}

/**
 * The first moment the order was in motion, for the delivery estimate's anchor.
 * Exported because the estimate module must not re-derive "when was this paid"
 * from a different rule than the timeline shows.
 */
export function timelineAnchor(input: TimelineInput): string | null {
  return input.orderPaidAt ?? earliest([input.orderCreatedAt])
}
