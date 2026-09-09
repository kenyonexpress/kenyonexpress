/**
 * May this customer ask for a refund on this order, and how many asks are left?
 *
 * PURE. No clock, no database: the caller supplies `now` and the rows, which is
 * what lets the cap be tested as a table rather than as a story about a form.
 *
 * THE CAP IS THREE PER ORDER AND IT IS ENFORCED IN TWO PLACES ON PURPOSE. Here,
 * so the customer is told the truth before they type ("בקשה 3 מתוך 3"), and in
 * the database, by the trigger in `migrations/pending/202`, because a hidden
 * button is not a limit. If those two ever disagree the database wins and the
 * action reports the refusal - which is the right way round, and is why the
 * action does not treat the trigger's error as an internal failure.
 *
 * WHY THE ASK IS NOT THE REFUND. Nothing here decides whether money moves.
 * `planOrderRefund` does that, under the cancellation-fee statute, when an
 * operator approves. This decides only whether the request may be RECORDED,
 * and it is deliberately more permissive than the refund rules are: a customer
 * whose claim will be refused is entitled to be told so by a person, not to
 * have the form quietly withhold itself.
 */

export const REFUND_REQUEST_CAP = 3

/**
 * A year. NOT a legal deadline, and it must not be read as one: the Consumer
 * Protection Law's cancellation window is fourteen days and is decided by the
 * operator at approval, where the facts are. This is an operational bound on
 * the FORM, so a five-year-old order does not open a support case in one click,
 * and it is long enough that every voucher this shop sells has expired inside
 * it. Past this, the answer is support rather than silence.
 */
export const REFUND_REQUEST_WINDOW_DAYS = 365

export type RefundRequestRow = {
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn'
}

export type RefundRequestRefusal =
  | 'ORDER_NOT_PAID'
  | 'ALREADY_REFUNDED'
  | 'CAP_REACHED'
  | 'ALREADY_PENDING'
  | 'WINDOW_CLOSED'

export type RefundRequestDecision =
  | { allowed: true; remaining: number }
  | { allowed: false; reason: RefundRequestRefusal; message: string; remaining: number }

const MESSAGES: Record<RefundRequestRefusal, string> = {
  ORDER_NOT_PAID: 'אפשר לבקש החזר רק על הזמנה ששולמה.',
  ALREADY_REFUNDED: 'ההזמנה הזו כבר זוכתה.',
  CAP_REACHED: `הגעתם ל-${REFUND_REQUEST_CAP} בקשות החזר על ההזמנה הזו, שהוא המקסימום. פנו לתמיכה ונטפל בזה אישית.`,
  ALREADY_PENDING: 'כבר יש בקשת החזר פתוחה על ההזמנה הזו. נעדכן אתכם ברגע שתיבדק.',
  WINDOW_CLOSED: `אפשר לבקש החזר עד ${REFUND_REQUEST_WINDOW_DAYS} ימים מהתשלום. פנו לתמיכה ונבדוק בכל זאת.`,
}

const DAY_MS = 24 * 60 * 60 * 1000

export function decideRefundRequest(input: {
  orderStatus: string
  paidAt: string | Date | null
  existing: RefundRequestRow[]
  now: Date
}): RefundRequestDecision {
  // EVERY row counts, including withdrawn ones. Otherwise the cap is bypassed
  // by opening, withdrawing and reopening, and withdrawing is free. The
  // database trigger counts the same way, for the same reason.
  const used = input.existing.length
  const remaining = Math.max(0, REFUND_REQUEST_CAP - used)

  const refuse = (reason: RefundRequestRefusal): RefundRequestDecision => ({
    allowed: false,
    reason,
    message: MESSAGES[reason],
    remaining,
  })

  if (input.orderStatus === 'refunded') return refuse('ALREADY_REFUNDED')
  if (input.orderStatus !== 'paid') return refuse('ORDER_NOT_PAID')

  // Checked BEFORE the cap, because "one is already open" is the more useful
  // sentence: it tells the customer something is happening, where the cap
  // message sends them to support they do not yet need.
  if (input.existing.some((row) => row.status === 'pending')) return refuse('ALREADY_PENDING')

  if (used >= REFUND_REQUEST_CAP) return refuse('CAP_REACHED')

  if (input.paidAt) {
    const paid = input.paidAt instanceof Date ? input.paidAt : new Date(input.paidAt)
    const paidMs = paid.getTime()
    // An unparseable timestamp is not an expired window. A paid order with a
    // broken date must not lose the customer their right to ask.
    if (Number.isFinite(paidMs)) {
      const ageDays = (input.now.getTime() - paidMs) / DAY_MS
      if (ageDays > REFUND_REQUEST_WINDOW_DAYS) return refuse('WINDOW_CLOSED')
    }
  }

  return { allowed: true, remaining }
}
