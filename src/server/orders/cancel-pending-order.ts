import { writeAuditLog } from '@/lib/admin/audit'
import type { AdminSessionInfo } from '@/lib/admin/rbac'
import { log } from '@/lib/observability/log'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * The one-click pending -> cancelled move, shared by the order page's cancel
 * form and the board's bulk cancel. NOT a server action: it takes the caller's
 * verified session and client, so it is never reachable from a browser with
 * arguments of the browser's choosing.
 *
 * Order status is owned by the payment/fulfilment flow (webhooks, finalize,
 * redemption). This is the one manual move that never touches money: an
 * unpaid order is a reservation, and cancelling it hands the stock and the
 * discount claim back. A paid order is refunded through the refund console.
 */

export type CancelPendingResult = { ok: true } | { ok: false; error: string }

// A loosely typed client on purpose: the callers hold the RLS client (the
// order page) and the service client (the board), and the tables touched here
// read the same on both.
type Client = Pick<SupabaseClient, 'from' | 'rpc'>

export async function cancelPendingOrderCore(input: {
  supabase: Client
  session: AdminSessionInfo
  orderId: string
  reason: string
}): Promise<CancelPendingResult> {
  const { supabase, session, orderId, reason } = input

  const { data: order } = await supabase
    .from('orders')
    .select('id, status, notes')
    .eq('id', orderId)
    .single()

  if (!order) return { ok: false, error: 'הזמנה לא נמצאה' }
  if (order.status !== 'pending') {
    return {
      ok: false,
      error:
        order.status === 'paid'
          ? 'הזמנה ששולמה אינה מבוטלת ידנית; החזר כספי מתבצע דרך מסלול ההחזרים'
          : 'רק הזמנה בסטטוס ממתין ניתנת לביטול ידני',
    }
  }

  const cancelNote = `ביטול אדמין: ${reason}`
  const { error } = await supabase
    .from('orders')
    .update({
      status: 'cancelled',
      notes: order.notes ? `${order.notes}\n${cancelNote}` : cancelNote,
    })
    .eq('id', orderId)
    .eq('status', 'pending')

  if (error) return { ok: false, error: error.message }

  // Hand the stock back immediately rather than waiting for the hold to lapse.
  // An expired reservation stops counting against availability on its own -
  // `available_stock` filters on `expires_at` - but "on its own" can be up to
  // fifteen minutes away, and a cancelled order is stock that is known free
  // now. Best effort: a failure here costs a quarter of an hour of shelf space,
  // not a cancellation.
  const { error: releaseError } = await supabase.rpc('release_order_stock', {
    p_order_id: orderId,
  })
  if (releaseError) {
    log.warn('admin.order_cancel_stock_release_failed', {
      orderId,
      reason: releaseError.message,
    })
  }

  // The discount claim goes back with the stock, for the same reason and with
  // the same best-effort stance: the sweep frees it at expires_at anyway, this
  // just does it now. release_order_discount hands the use back on both
  // counters (discount_campaigns and coupons) via released_at.
  const { error: discountReleaseError } = await supabase.rpc('release_order_discount', {
    p_order_id: orderId,
  })
  if (discountReleaseError) {
    log.warn('admin.order_cancel_discount_release_failed', {
      orderId,
      reason: discountReleaseError.message,
    })
  }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'status_change',
    entityType: 'orders',
    entityId: orderId,
    changes: { status: { from: 'pending', to: 'cancelled' } },
    metadata: { reason },
  })

  return { ok: true }
}
