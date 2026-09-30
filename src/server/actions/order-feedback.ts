'use server'

import { contactEmail } from '@/lib/contact-address'
import { sendEmail } from '@/lib/email/resend'
import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import {
  FEEDBACK_ALREADY_SENT,
  FEEDBACK_NOT_ELIGIBLE,
  FEEDBACK_TABLE_MISSING,
  buildFeedbackNotice,
  orderFeedbackFromForm,
  orderFeedbackSchema,
} from '@/lib/orders/feedback'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/utils/rate-limit'
import { revalidatePath } from 'next/cache'

/**
 * Private feedback on an order, written on the USER client on purpose.
 *
 * The action decides nothing about eligibility. The INSERT policy in 247
 * admits a row only for a paid, undeleted order of the inserting user and
 * only once per order (UNIQUE); running on the user's own session makes
 * those policies the enforcement, and this file only translates their
 * refusals into Hebrew. A service-role write here would silently let a
 * forged order_id through.
 *
 * After the row is in, the owner gets a mail at the shop inbox. The mail is
 * a COPY: the row is the record, the admin order page reads it, and a mail
 * that fails to send is logged and does not fail the customer's submission.
 * The idempotency key is the order id, so a double-submit that somehow
 * passes the UNIQUE cannot mail twice either.
 */

export type OrderFeedbackResult =
  | { ok: true }
  | {
      ok: false
      reason:
        | 'signed_out'
        | 'invalid'
        | 'rate_limited'
        | 'not_eligible'
        | 'already_sent'
        | 'not_applied'
        | 'error'
      error: string
    }

const SIGNED_OUT = 'צריך להתחבר כדי לשלוח משוב.'
const NOT_ELIGIBLE = 'אפשר לשלוח משוב רק על הזמנה ששולמה.'
const ALREADY_SENT = 'כבר שלחתם משוב על ההזמנה הזו. תודה!'
const NOT_APPLIED = 'המשוב עוד לא פתוח. נסו שוב בקרוב.'
const FAILED = 'שליחת המשוב נכשלה. נסו שוב.'
const RATE_LIMITED = 'יותר מדי הודעות בשעה האחרונה. נסו שוב מאוחר יותר.'

async function runSubmitOrderFeedback(formData: FormData): Promise<OrderFeedbackResult> {
  const parsed = orderFeedbackSchema.safeParse(orderFeedbackFromForm(formData))
  if (!parsed.success) {
    return {
      ok: false,
      reason: 'invalid',
      error: parsed.error.issues[0]?.message ?? 'בדקו את הפרטים ונסו שוב.',
    }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, reason: 'signed_out', error: SIGNED_OUT }

  if (!(await checkRateLimit(`order-feedback:${user.id}`, 10, 3600))) {
    return { ok: false, reason: 'rate_limited', error: RATE_LIMITED }
  }

  const { orderId, rating } = parsed.data
  const body = parsed.data.body && parsed.data.body.length > 0 ? parsed.data.body : null

  const { error } = await supabase.from('order_feedback' as never).insert({
    order_id: orderId,
    user_id: user.id,
    rating,
    body,
  } as never)

  if (error) {
    if (error.code === FEEDBACK_NOT_ELIGIBLE) {
      return { ok: false, reason: 'not_eligible', error: NOT_ELIGIBLE }
    }
    if (error.code === FEEDBACK_ALREADY_SENT) {
      return { ok: false, reason: 'already_sent', error: ALREADY_SENT }
    }
    if (error.code === FEEDBACK_TABLE_MISSING) {
      return { ok: false, reason: 'not_applied', error: NOT_APPLIED }
    }
    log.warn('order_feedback.insert_failed', { orderId, code: error.code ?? null })
    return { ok: false, reason: 'error', error: FAILED }
  }

  const notice = buildFeedbackNotice({
    orderId,
    rating,
    body,
    customerEmail: user.email ?? null,
    customerName:
      typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : null,
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'https://kenyonexpress.co.il',
  })
  const sent = await sendEmail({
    to: contactEmail(),
    replyTo: user.email ?? undefined,
    subject: notice.subject,
    html: notice.html,
    text: notice.text,
    idempotencyKey: notice.idempotencyKey,
  })
  if (!sent.ok && !sent.skipped) {
    // The row is the record and the admin page shows it; the mail is a
    // courtesy copy. Say so in the log, not to the customer.
    log.warn('order_feedback.notice_not_sent', { orderId, reason: sent.reason })
  }

  revalidatePath(`/account/orders/${orderId}`)
  return { ok: true }
}

export async function submitOrderFeedback(formData: FormData): Promise<OrderFeedbackResult> {
  return withActionContext('order_feedback.submit', () => runSubmitOrderFeedback(formData))
}
