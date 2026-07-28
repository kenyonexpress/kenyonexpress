'use server'

import { writeAuditLog } from '@/lib/admin/audit'
import { reconcile } from '@/lib/admin/payment-reconciliation'
import { requireSection } from '@/lib/admin/rbac'
import { createAdminClient } from '@/lib/supabase/admin'
import { finalizeOrder } from '@/server/payments/finalize'
import { revalidatePath } from 'next/cache'

/**
 * Re-runs order closure for a charge that succeeded and left its order open.
 *
 * `finalizeOrder` is idempotent: it returns `replay: true` the moment
 * `orders.paid_at` is set, so a double click, a concurrent webhook and this
 * button cannot double-issue vouchers or double-credit a supplier. That is what
 * makes the repair safe to expose at all.
 *
 * The verdict is recomputed here from freshly read rows rather than trusted from
 * the client. A stale page offering "retry" on a row that has since settled must
 * not be able to drive a finalize that the classifier would refuse.
 */
export async function retryFinalizePayment(
  paymentId: string,
): Promise<{ ok: true; replay: boolean } | { ok: false; error: string }> {
  let session: Awaited<ReturnType<typeof requireSection>>
  try {
    session = await requireSection('payments', 'write')
  } catch {
    return { ok: false, error: 'אין הרשאה' }
  }

  const admin = createAdminClient()

  const { data: payment } = await admin
    .from('payments')
    .select('id, order_id, kind, status, amount_ils, succeeded_at, cardcom_transaction_id')
    .eq('id', paymentId)
    .maybeSingle()
  if (!payment?.order_id) return { ok: false, error: 'תשלום לא נמצא או אינו משויך להזמנה' }

  const { data: order } = await admin
    .from('orders')
    .select('id, status, paid_at')
    .eq('id', payment.order_id)
    .maybeSingle()
  if (!order) return { ok: false, error: 'ההזמנה לא נמצאה' }

  const verdict = reconcile({
    paymentId: payment.id,
    orderId: order.id,
    paymentStatus: payment.status,
    paymentKind: payment.kind,
    orderPaidAt: order.paid_at,
    orderStatus: order.status,
    amountIls: payment.amount_ils,
    succeededAt: payment.succeeded_at,
    transactionId: payment.cardcom_transaction_id,
  })

  if (!verdict.retryable) {
    return { ok: false, error: `אין מה לתקן כאן: ${verdict.message}` }
  }

  const result = await finalizeOrder({
    orderId: order.id,
    paymentId: payment.id,
    transactionId: payment.cardcom_transaction_id,
  })

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'manual_override',
    entityType: 'payments',
    entityId: payment.id,
    changes: { order_id: order.id, outcome: result.ok ? 'ok' : 'failed' },
    metadata: { reason: 'retry finalize from reconciliation screen' },
  })

  revalidatePath('/admin/payments')
  revalidatePath(`/admin/orders/${order.id}`)

  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true, replay: result.replay === true }
}
