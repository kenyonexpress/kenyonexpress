import { log } from '@/lib/observability/log'
import { FEEDBACK_TABLE_MISSING } from '@/lib/orders/feedback'
import type { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

/**
 * Reads of the private order feedback (pending 247).
 *
 * Two readers and no third. The customer reads their own row on the USER
 * client, where the owner-only SELECT policy is the boundary. Staff read a
 * given order's row on the service client, behind the admin page's own RBAC
 * gate. There is no public read, no list across customers on the storefront,
 * and no aggregate: the table exists so one customer can tell the owner how
 * one order went.
 *
 * Both degrade while 247 is unapplied (PGRST205): the account page hides the
 * form, the admin page shows no block, and nothing logs, because a missing
 * table is the documented state until Ofir applies the file.
 */

export interface OrderFeedback {
  rating: number
  body: string | null
  createdAt: string
}

export interface MyOrderFeedback {
  /** False while the table is missing: the page must not offer the form. */
  available: boolean
  feedback: OrderFeedback | null
}

interface FeedbackRow {
  rating: number
  body: string | null
  created_at: string
}

function toFeedback(row: FeedbackRow): OrderFeedback {
  return { rating: row.rating, body: row.body, createdAt: row.created_at }
}

/** The signed-in customer's own feedback on one of their orders. */
export async function getMyOrderFeedback(orderId: string): Promise<MyOrderFeedback> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { available: false, feedback: null }

  const { data, error } = await supabase
    .from('order_feedback' as never)
    .select('rating, body, created_at')
    .eq('order_id', orderId)
    .maybeSingle()

  if (error) {
    if (error.code === FEEDBACK_TABLE_MISSING) return { available: false, feedback: null }
    // A failed read must not open the form on an order that already has its
    // row: the INSERT would then be refused with "already sent", which reads
    // as a bug. Hide the form and say why in the log.
    log.warn('order_feedback.read_failed', { orderId, code: error.code ?? null })
    return { available: false, feedback: null }
  }
  return {
    available: true,
    feedback: data ? toFeedback(data as unknown as FeedbackRow) : null,
  }
}

/**
 * One order's feedback for the admin order page. The caller has already
 * passed `requireSection('orders', 'read')`; this only reads.
 */
export async function readOrderFeedbackForAdmin(
  admin: ReturnType<typeof createAdminClient>,
  orderId: string,
): Promise<OrderFeedback | null> {
  const { data, error } = await admin
    .from('order_feedback' as never)
    .select('rating, body, created_at')
    .eq('order_id', orderId)
    .maybeSingle()
  if (error) {
    if (error.code !== FEEDBACK_TABLE_MISSING) {
      log.warn('order_feedback.admin_read_failed', { orderId, code: error.code ?? null })
    }
    return null
  }
  return data ? toFeedback(data as unknown as FeedbackRow) : null
}
