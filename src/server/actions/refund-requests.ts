'use server'

import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/utils/rate-limit'
import {
  REFUND_REQUEST_CAP,
  type RefundRequestRow,
  decideRefundRequest,
} from '@/server/domain/orders/refund-request'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

/**
 * The customer's side of a refund: asking for one.
 *
 * WHAT THIS DOES NOT DO. It does not refund anything and it does not decide
 * anything. It records a request and puts it in front of a person. The money
 * moves in `actions/payments/refund.ts`, behind `requireAdminSession`, under
 * the cancellation-fee statute - and keeping those two apart is the point,
 * because a customer-triggered path that could move money is a path where the
 * customer chooses when money moves.
 *
 * WHY THE WRITE IS ON THE SERVICE-ROLE CLIENT AND NOT AN RLS INSERT. A policy
 * can express "this row is yours" and nothing else. It cannot check that the
 * order is paid, that it is not already refunded, that the window is open, or
 * that this is not the fourth ask - so a client-side INSERT would fill the
 * operator's queue with requests against orders that cannot be refunded. 202
 * therefore grants SELECT to the owner and no INSERT to anyone.
 *
 * THE CAP IS CHECKED TWICE AND THAT IS NOT REDUNDANT. `decideRefundRequest`
 * checks it so the customer is told the truth before typing; the trigger in 202
 * checks it because a hidden button is not a limit. When the trigger is the one
 * that fires, its refusal is reported as the cap being reached rather than as an
 * internal error, because that is what happened.
 */

const schema = z.object({
  order_id: z.string().uuid(),
  reason_code: z.enum([
    'not_as_described',
    'not_received',
    'defective',
    'changed_mind',
    'duplicate_charge',
    'other',
  ]),
  reason_text: z.string().trim().min(10, 'נא לפרט לפחות 10 תווים').max(2000, 'הפירוט ארוך מדי'),
})

export type RefundRequestState = {
  ok: boolean
  message?: string
  error?: string
  /** How many of the three asks remain after this one. */
  remaining?: number
}

/** Postgres check_violation, which is what the cap trigger raises. */
const CHECK_VIOLATION = '23514'
const MISSING_TABLE = new Set(['42P01', 'PGRST205'])

async function runRequestRefund(
  _prev: RefundRequestState,
  formData: FormData,
): Promise<RefundRequestState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'יש להתחבר כדי לבקש החזר' }

  const parsed = schema.safeParse({
    order_id: formData.get('order_id'),
    reason_code: formData.get('reason_code'),
    reason_text: formData.get('reason_text'),
  })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'בדקו את הפרטים ונסו שוב' }
  }

  // Per user, not per IP: this action needs a session, so there is an account to
  // key on, and a household behind one address must not share one allowance.
  // Above the cap of three on any single order and low enough to bound somebody
  // opening a request on every order they have ever placed in one sitting.
  if (!(await checkRateLimit(`refund-request:${user.id}`, 10, 3600))) {
    return { ok: false, error: 'יותר מדי בקשות. נסו שוב מאוחר יותר.' }
  }

  const admin = createAdminClient()

  // Ownership is proven here, on the service-role client, for the same reason
  // the saved-card charge proves it: this client does not consult RLS, so an
  // order id from somebody else's account must not be actionable by guessing.
  const { data: order, error: orderError } = await admin
    .from('orders')
    .select('id, status, paid_at, user_id')
    .eq('id', parsed.data.order_id)
    .maybeSingle()
  if (orderError) {
    log.error('refund_request.order_read_failed', {
      userId: user.id,
      reason: orderError.message,
    })
    return { ok: false, error: 'לא ניתן לטעון את ההזמנה כרגע, נסו שוב' }
  }
  // Deliberately the same sentence for "not found" and "not yours": a different
  // message for each confirms that an order id exists.
  if (!order || order.user_id !== user.id) {
    return { ok: false, error: 'ההזמנה לא נמצאה' }
  }

  const existing = await readRequests(admin, parsed.data.order_id)
  const decision = decideRefundRequest({
    orderStatus: order.status,
    paidAt: order.paid_at,
    existing,
    now: new Date(),
  })
  if (!decision.allowed) {
    return { ok: false, error: decision.message, remaining: decision.remaining }
  }

  const { error: insertError } = await admin.from('refund_requests').insert({
    order_id: parsed.data.order_id,
    user_id: user.id,
    reason_code: parsed.data.reason_code,
    reason_text: parsed.data.reason_text,
  } as never)

  if (insertError) {
    if (insertError.code === CHECK_VIOLATION) {
      // The trigger, not us. Two tabs, or a race the read above could not see.
      // Reported as the cap because that is what it is.
      return {
        ok: false,
        error: `הגעתם ל-${REFUND_REQUEST_CAP} בקשות החזר על ההזמנה הזו. פנו לתמיכה.`,
        remaining: 0,
      }
    }
    if (MISSING_TABLE.has(insertError.code ?? '')) {
      // 202 is not applied. Says so plainly rather than "אירעה שגיאה": a
      // customer told to try again will, forever.
      log.error('refund_request.table_missing', { orderId: parsed.data.order_id })
      return {
        ok: false,
        error: 'טופס בקשות ההחזר עדיין לא פעיל. פנו אלינו ונטפל בזה.',
      }
    }
    log.error('refund_request.insert_failed', {
      orderId: parsed.data.order_id,
      reason: insertError.message,
    })
    return { ok: false, error: 'שמירת הבקשה נכשלה, נסו שוב' }
  }

  revalidatePath(`/account/orders/${parsed.data.order_id}`)
  return {
    ok: true,
    message: 'הבקשה נשלחה. נבדוק אותה ונחזור אליכם.',
    remaining: decision.remaining - 1,
  }
}

async function readRequests(
  admin: ReturnType<typeof createAdminClient>,
  orderId: string,
): Promise<RefundRequestRow[]> {
  const { data, error } = await admin
    .from('refund_requests')
    .select('status')
    .eq('order_id', orderId)
  if (error) {
    // An unreadable table is an UNAPPLIED table, and reporting zero existing
    // requests is the honest answer: the insert below will fail on the same
    // missing relation and say so. Reporting three instead would refuse a
    // customer on the strength of rows nobody could read.
    if (!MISSING_TABLE.has(error.code ?? '')) {
      log.warn('refund_request.read_failed', { orderId, reason: error.message })
    }
    return []
  }
  return (data ?? []) as unknown as RefundRequestRow[]
}

export async function requestRefund(
  prev: RefundRequestState,
  formData: FormData,
): Promise<RefundRequestState> {
  return withActionContext('refund_request.create', () => runRequestRefund(prev, formData))
}

/** What the order page needs to render the form, or to explain its absence. */
export async function refundRequestStatus(orderId: string): Promise<RefundRequestStatus> {
  return withActionContext('refund_request.status', () => runRefundRequestStatus(orderId))
}

export type RefundRequestStatus = {
  allowed: boolean
  message: string | null
  remaining: number
  requests: Array<{ status: string; created_at: string; reason_code: string }>
}

async function runRefundRequestStatus(orderId: string): Promise<RefundRequestStatus> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { allowed: false, message: null, remaining: REFUND_REQUEST_CAP, requests: [] }

  const admin = createAdminClient()
  const { data: order, error: orderError } = await admin
    .from('orders')
    .select('id, status, paid_at, user_id')
    .eq('id', orderId)
    .maybeSingle()
  if (orderError) {
    // A read that FAILED is not an order that is not yours. Both used to leave
    // here as "no form and no explanation", which on the page of an order the
    // customer is looking at reads as the refund button having been taken away.
    log.warn('refund_request.status_order_read_failed', { orderId, reason: orderError.message })
    return {
      allowed: false,
      message: 'לא ניתן לטעון את מצב הבקשות כרגע. נסו לרענן.',
      remaining: REFUND_REQUEST_CAP,
      requests: [],
    }
  }
  if (!order || order.user_id !== user.id) {
    return { allowed: false, message: null, remaining: REFUND_REQUEST_CAP, requests: [] }
  }

  const { data, error: requestsError } = await admin
    .from('refund_requests')
    .select('status, created_at, reason_code')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false })
  if (requestsError && !MISSING_TABLE.has(requestsError.code ?? '')) {
    log.warn('refund_request.status_read_failed', { orderId, reason: requestsError.message })
  }
  const rows = (data ?? []) as unknown as Array<{
    status: string
    created_at: string
    reason_code: string
  }>

  const decision = decideRefundRequest({
    orderStatus: order.status,
    paidAt: order.paid_at,
    existing: rows as RefundRequestRow[],
    now: new Date(),
  })

  return {
    allowed: decision.allowed,
    message: decision.allowed ? null : decision.message,
    remaining: decision.remaining,
    requests: rows,
  }
}
