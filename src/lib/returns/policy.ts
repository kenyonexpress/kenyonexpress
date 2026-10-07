import { type Agorot, agorot } from '@/lib/commerce/money'
import { computeCancellationFee } from '@/server/domain/orders/refund'
import type { RefundGround, RefundState } from '@/server/payments/refund-record'
import { z } from 'zod'

/**
 * Returns and cancellations from the customer's side: the pure half (STEP 44).
 *
 * The record is `public.refunds` (131, live in production with 2 rows on
 * 2026-10-08). Its `requested` state existed in the enum from day one and
 * nothing wrote it: every row so far was opened by an admin in `executing`.
 * This module is what the customer-facing flow decides with, and it holds no
 * IO: the account page, the server action and the tests all read the same
 * answers from here.
 *
 * WHAT A "RETURN" IS HERE. The statutory cancellation of a distance sale
 * (Consumer Protection Law section 14ג): the whole order, within 14 days of
 * the later of payment and delivery. The customer names a reason code, a
 * destination for the money, and a note. The platform decides; the decision
 * runs through the existing admin refund path (card) or the wallet credit
 * (store credit). The customer's reason code is NOT the statutory ground: the
 * code is what they said, the ground is what the row is adjudicated under, and
 * the mapping below is the default an admin can override.
 *
 * MONEY: integer agorot everywhere, the fee through `computeCancellationFee`,
 * which is the one place the 5%-capped-at-100 rule lives.
 */

export const RETURN_WINDOW_DAYS = 14
export const RETURN_NOTE_MAX = 1000

export const RETURN_REASON_CODES = [
  'changed_mind',
  'defective',
  'not_as_described',
  'wrong_item',
  'not_received',
  'duplicate_charge',
  'other',
] as const
export type ReturnReasonCode = (typeof RETURN_REASON_CODES)[number]

export const RETURN_DESTINATIONS = ['original_method', 'wallet'] as const
export type ReturnDestination = (typeof RETURN_DESTINATIONS)[number]

export interface ReturnReason {
  label: string
  /** The statutory ground this code lands on by default. */
  ground: RefundGround
  /** False when the law forbids a fee: the fault is the trader's. */
  feeApplies: boolean
  hint: string
}

export const RETURN_REASONS: Readonly<Record<ReturnReasonCode, ReturnReason>> = {
  changed_mind: {
    label: 'התחרטתי',
    ground: 'distance_sale_14d',
    feeApplies: true,
    hint: 'ביטול עסקה בתוך 14 יום. ייתכנו דמי ביטול לפי חוק.',
  },
  defective: {
    label: 'המוצר פגום',
    ground: 'defect',
    feeApplies: false,
    hint: 'ללא דמי ביטול.',
  },
  not_as_described: {
    label: 'המוצר שונה מהתיאור',
    ground: 'defect',
    feeApplies: false,
    hint: 'ללא דמי ביטול.',
  },
  wrong_item: {
    label: 'קיבלתי פריט שגוי',
    ground: 'defect',
    feeApplies: false,
    hint: 'ללא דמי ביטול.',
  },
  not_received: {
    label: 'ההזמנה לא הגיעה',
    ground: 'service_not_provided',
    feeApplies: false,
    hint: 'ללא דמי ביטול.',
  },
  duplicate_charge: {
    label: 'חויבתי פעמיים',
    ground: 'duplicate_charge',
    feeApplies: false,
    hint: 'ללא דמי ביטול.',
  },
  other: {
    label: 'סיבה אחרת',
    ground: 'distance_sale_14d',
    feeApplies: true,
    hint: 'ביטול עסקה בתוך 14 יום. ייתכנו דמי ביטול לפי חוק.',
  },
}

export const RETURN_DESTINATION_LABELS: Readonly<Record<ReturnDestination, string>> = {
  original_method: 'החזר לאמצעי התשלום המקורי',
  wallet: 'זיכוי לארנק באתר (ללא דמי ביטול)',
}

export function isReturnReasonCode(value: unknown): value is ReturnReasonCode {
  return typeof value === 'string' && (RETURN_REASON_CODES as readonly string[]).includes(value)
}

export function isReturnDestination(value: unknown): value is ReturnDestination {
  return typeof value === 'string' && (RETURN_DESTINATIONS as readonly string[]).includes(value)
}

export const returnRequestSchema = z.object({
  orderId: z.string().uuid('הזמנה לא תקינה'),
  reasonCode: z.enum(RETURN_REASON_CODES, { message: 'בחרו סיבה להחזרה' }),
  destination: z.enum(RETURN_DESTINATIONS, { message: 'בחרו לאן להחזיר את הכסף' }),
  note: z.string().trim().max(RETURN_NOTE_MAX, `עד ${RETURN_NOTE_MAX} תווים`).optional(),
})

export type ReturnRequestInput = z.infer<typeof returnRequestSchema>

/** Reads the form the way the action does; absent fields fail as absent, not as ''. */
export function returnRequestFromForm(formData: FormData): unknown {
  const note = formData.get('note')
  return {
    orderId: formData.get('orderId'),
    reasonCode: formData.get('reasonCode') ?? undefined,
    destination: formData.get('destination') ?? undefined,
    note: typeof note === 'string' ? note : undefined,
  }
}

// ----------------------------------------------------------------- the RMA

const ISRAEL_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Jerusalem',
  year: '2-digit',
  month: '2-digit',
  day: '2-digit',
})

/**
 * The return authorisation number: `RMA-YYMMDD-XXXXXXXX`.
 *
 * Derived, not allocated. The day is the request day in Israel and the tail
 * is the first eight hex digits of the row's own id, so the number exists the
 * moment the row does, needs no counter, and is the same string whether the
 * code computes it (today) or the trigger in 259 stores it (once applied).
 * A stored number that disagreed with the derived one would be a bug, and
 * the test for 259 asserts the SQL expression against this function.
 */
export function rmaNumber(id: string, requestedAt: string | Date): string {
  const at = typeof requestedAt === 'string' ? new Date(requestedAt) : requestedAt
  const day = Number.isNaN(at.getTime()) ? '000000' : ISRAEL_DAY.format(at).replace(/-/g, '')
  const tail = id.replace(/-/g, '').slice(0, 8).toUpperCase()
  return `RMA-${day}-${tail}`
}

// ------------------------------------------------------------ eligibility

export interface ReturnEligibilityLine {
  productType: 'coupon' | 'physical'
  settlementStatus: string
  deliveredAt: string | null
  voucherStatuses: readonly string[]
}

export interface ReturnEligibilityInput {
  status: string
  paidAt: string | null
  lines: readonly ReturnEligibilityLine[]
  /** A row already in `requested`, `approved` or `executing` for this order. */
  openRequest: boolean
  now: Date
}

export type ReturnRefusal =
  | 'not_paid'
  | 'already_open'
  | 'already_refunded'
  | 'nothing_to_return'
  | 'window_closed'

export type ReturnEligibility =
  | {
      ok: true
      /** ISO of the day the window closes, or null while a parcel is still on its way. */
      windowEndsAt: string | null
      hasPhysical: boolean
      /**
       * A redeemed or expired coupon has consumed its value at the counter;
       * the card cannot be credited for it (section 2.2 of the refunds
       * architecture). Store credit is the only destination then.
       */
      allowedDestinations: readonly ReturnDestination[]
    }
  | { ok: false; reason: ReturnRefusal; message: string }

const REFUSAL_MESSAGES: Record<ReturnRefusal, string> = {
  not_paid: 'אפשר לבקש החזרה רק על הזמנה ששולמה.',
  already_open: 'כבר פתוחה בקשת החזרה להזמנה הזו. אפשר לעקוב אחרי מצבה כאן.',
  already_refunded: 'ההזמנה הזו כבר זוכתה.',
  nothing_to_return: 'אין בהזמנה הזו פריטים שניתן להחזיר.',
  window_closed: `חלון הביטול של ${RETURN_WINDOW_DAYS} הימים להזמנה הזו נסגר. אפשר לפנות אלינו ונבדוק.`,
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * The clock, per section 3.1 of the refunds architecture: the window runs
 * from the LATER of payment and delivery. A physical line not yet delivered
 * reads as "still open", never as "expired". Lines already refunded or
 * cancelled do not count.
 */
export function evaluateReturnEligibility(input: ReturnEligibilityInput): ReturnEligibility {
  if (input.status === 'refunded') return refuse('already_refunded')
  if (input.status !== 'paid' || !input.paidAt) return refuse('not_paid')
  if (input.openRequest) return refuse('already_open')

  const live = input.lines.filter(
    (line) => line.settlementStatus !== 'refunded' && line.settlementStatus !== 'cancelled',
  )
  if (live.length === 0) return refuse('nothing_to_return')

  const paidMs = new Date(input.paidAt).getTime()
  let startMs = paidMs
  let awaitingDelivery = false
  for (const line of live) {
    if (line.productType !== 'physical') continue
    if (!line.deliveredAt) {
      awaitingDelivery = true
      continue
    }
    startMs = Math.max(startMs, new Date(line.deliveredAt).getTime())
  }
  const windowEndMs = startMs + RETURN_WINDOW_DAYS * DAY_MS
  if (!awaitingDelivery && input.now.getTime() > windowEndMs) return refuse('window_closed')

  const consumed = live.some((line) =>
    line.voucherStatuses.some((s) => s === 'redeemed' || s === 'expired'),
  )
  return {
    ok: true,
    windowEndsAt: awaitingDelivery ? null : new Date(windowEndMs).toISOString(),
    hasPhysical: live.some((line) => line.productType === 'physical'),
    allowedDestinations: consumed ? ['wallet'] : RETURN_DESTINATIONS,
  }
}

function refuse(reason: ReturnRefusal): ReturnEligibility {
  return { ok: false, reason, message: REFUSAL_MESSAGES[reason] }
}

// ---------------------------------------------------------------- preview

export interface ReturnRefundPreview {
  feeAgorot: Agorot
  refundAgorot: Agorot
}

/**
 * What the customer is told before they ask. The card path may carry the
 * statutory fee; the wallet path never does (148's `refunds_wallet_has_no_fee`),
 * and the law zeroes it when the fault is the trader's. The admin's decision
 * is what finally applies, through `planOrderRefund`; this is the same rule
 * read earlier, so the two cannot disagree.
 */
export function previewReturnRefund(input: {
  requestedAgorot: number
  reasonCode: ReturnReasonCode
  destination: ReturnDestination
}): ReturnRefundPreview {
  const requested = agorot(Math.max(0, Math.trunc(input.requestedAgorot)))
  const feeApplies =
    input.destination === 'original_method' && RETURN_REASONS[input.reasonCode].feeApplies
  const fee = computeCancellationFee(requested, !feeApplies)
  return { feeAgorot: fee, refundAgorot: agorot(requested - fee) }
}

// ----------------------------------------------------------------- status

export type ReturnTone = 'ok' | 'warn' | 'dead' | 'default'

export const RETURN_STATE_LABELS: Readonly<
  Record<RefundState, { label: string; tone: ReturnTone }>
> = {
  requested: { label: 'התקבלה, ממתינה לבדיקה', tone: 'warn' },
  approved: { label: 'אושרה', tone: 'ok' },
  executing: { label: 'ההחזר בביצוע', tone: 'ok' },
  completed: { label: 'הושלמה, הכסף הוחזר', tone: 'ok' },
  rejected: { label: 'נדחתה', tone: 'dead' },
  failed: { label: 'ההחזר נכשל, אנחנו מטפלים', tone: 'dead' },
}

export interface ReturnTimelineStep {
  key: 'requested' | 'approved' | 'executing' | 'completed'
  label: string
  done: boolean
  current: boolean
}

const TIMELINE: readonly { key: ReturnTimelineStep['key']; label: string }[] = [
  { key: 'requested', label: 'הבקשה התקבלה' },
  { key: 'approved', label: 'אושרה' },
  { key: 'executing', label: 'ההחזר בביצוע' },
  { key: 'completed', label: 'הכסף הוחזר' },
]

/** Four steps; a rejected or failed request stops where it stopped. */
export function returnTimeline(state: RefundState): ReturnTimelineStep[] {
  const reached: Record<RefundState, number> = {
    requested: 0,
    approved: 1,
    executing: 2,
    completed: 3,
    rejected: 0,
    failed: 2,
  }
  const index = reached[state]
  const terminalFailure = state === 'rejected' || state === 'failed'
  return TIMELINE.map((step, i) => ({
    key: step.key,
    label: step.label,
    done: i < index || (i === index && !terminalFailure),
    current: i === index,
  }))
}

/** The statutory deadline the row's trigger derives: notice + 14 days. */
export function refundDueBy(requestedAt: string | Date): Date {
  const at = typeof requestedAt === 'string' ? new Date(requestedAt) : requestedAt
  return new Date(at.getTime() + RETURN_WINDOW_DAYS * DAY_MS)
}
