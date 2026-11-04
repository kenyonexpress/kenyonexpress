import type { Agorot } from '@/lib/money'
import { computeCancellationFee } from '@/server/domain/orders/refund'

/**
 * May this order be cancelled under Consumer Protection Law s.14C, and on what
 * terms?
 *
 * PURE. The caller supplies `now`, the voucher states and the booked service
 * time, so the rule is a table in the test file rather than a story about a
 * page.
 *
 * THE RULE, as the owner wrote it (IRON RULES, BRAND + LEGAL):
 *  - within 14 days of payment,
 *  - only if nothing on the order has been redeemed,
 *  - and not when a booked service is less than 2 business days away,
 *  - fee min(5%, 100 ILS), through `computeCancellationFee`.
 *
 * WHAT THIS IS NOT. It is not the defect-claim path. A coupon that never
 * worked, a parcel that never arrived, a double charge: none of those is a
 * voluntary cancellation and none is bound by the 14 days. The request form
 * keeps those reasons open; only `changed_mind` is gated by this decision.
 *
 * BUSINESS DAYS are Sunday to Thursday on the Israeli calendar. Public holidays
 * are not modelled, so a holiday counts as a business day here. That errs
 * towards refusing a cancellation the customer would be entitled to only when a
 * holiday falls inside the two days, and the operator can still approve it.
 */

export const CANCELLATION_WINDOW_DAYS = 14
export const SERVICE_NOTICE_BUSINESS_DAYS = 2

export type Cancellation14gRefusal =
  | 'ORDER_NOT_PAID'
  | 'WINDOW_CLOSED'
  | 'REDEEMED'
  | 'SERVICE_TOO_CLOSE'

export type Cancellation14gDecision =
  | { allowed: true; deadline: Date | null; feeAgorot: Agorot }
  | {
      allowed: false
      reason: Cancellation14gRefusal
      message: string
      deadline: Date | null
      feeAgorot: Agorot
    }

export const CANCELLATION_14G_MESSAGES: Record<Cancellation14gRefusal, string> = {
  ORDER_NOT_PAID: 'אפשר לבטל רק הזמנה ששולמה.',
  WINDOW_CLOSED: `חלפו ${CANCELLATION_WINDOW_DAYS} ימים מהתשלום, ולכן לא ניתן לבטל את העסקה לפי סעיף 14ג. אם יש תקלה במוצר או בשירות, פנו אלינו.`,
  REDEEMED: 'שובר בהזמנה הזו כבר מומש, ולכן לא ניתן לבטל אותה לפי סעיף 14ג. פנו אלינו ונבדוק.',
  SERVICE_TOO_CLOSE: `לא ניתן לבטל פחות מ-${SERVICE_NOTICE_BUSINESS_DAYS} ימי עסקים לפני מועד השירות שהוזמן.`,
}

const DAY_MS = 24 * 60 * 60 * 1000
const ISRAEL_TZ = 'Asia/Jerusalem'

function toDate(value: string | Date | null): Date | null {
  if (value === null) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isFinite(date.getTime()) ? date : null
}

/** The calendar date in Israel, as a UTC-midnight day number. */
function israelDayNumber(instant: Date): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ISRAEL_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  return Date.UTC(get('year'), get('month') - 1, get('day')) / DAY_MS
}

/** Sunday (0) to Thursday (4). Friday and Saturday are not business days. */
function isBusinessDay(dayNumber: number): boolean {
  return new Date(dayNumber * DAY_MS).getUTCDay() <= 4
}

/**
 * Whole business days strictly between today and the service day, on the
 * Israeli calendar. Booking on Sunday for Wednesday leaves Monday and Tuesday:
 * two, which is enough. For Tuesday it leaves one, which is not.
 */
export function businessDaysBetween(now: Date, serviceAt: Date): number {
  const from = israelDayNumber(now)
  const to = israelDayNumber(serviceAt)
  let count = 0
  for (let day = from + 1; day < to; day++) {
    if (isBusinessDay(day)) count++
  }
  return count
}

export function decideCancellation14g(input: {
  orderStatus: string
  paidAt: string | Date | null
  chargedAgorot: number
  vouchers: ReadonlyArray<{ status: string; usedAt?: string | null }>
  bookedServiceAt: string | Date | null
  now: Date
}): Cancellation14gDecision {
  const feeAgorot = computeCancellationFee(input.chargedAgorot, false)
  const paid = toDate(input.paidAt)
  const deadline = paid ? new Date(paid.getTime() + CANCELLATION_WINDOW_DAYS * DAY_MS) : null

  const refuse = (reason: Cancellation14gRefusal): Cancellation14gDecision => ({
    allowed: false,
    reason,
    message: CANCELLATION_14G_MESSAGES[reason],
    deadline,
    feeAgorot,
  })

  if (input.orderStatus !== 'paid') return refuse('ORDER_NOT_PAID')
  // An unknown payment time is not an expired window: the same rule
  // `decideRefundRequest` keeps, so a broken timestamp never costs the
  // customer a right.
  if (deadline && input.now.getTime() > deadline.getTime()) return refuse('WINDOW_CLOSED')
  if (input.vouchers.some((v) => v.status === 'redeemed' || Boolean(v.usedAt))) {
    return refuse('REDEEMED')
  }
  const service = toDate(input.bookedServiceAt)
  if (service && businessDaysBetween(input.now, service) < SERVICE_NOTICE_BUSINESS_DAYS) {
    return refuse('SERVICE_TOO_CLOSE')
  }
  return { allowed: true, deadline, feeAgorot }
}
