'use server'

import { writeAuditLog } from '@/lib/admin/audit'
import { type AdminSessionInfo, requireAdminSession } from '@/lib/admin/rbac'
import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

export type OrderActionState = { error: string } | { success: string } | null

const cancelSchema = z.object({
  id: z.string().uuid({ message: 'מזהה הזמנה לא תקין' }),
  reason: z
    .string()
    .trim()
    .min(3, 'חובה לציין סיבת ביטול (לפחות 3 תווים)')
    .max(500, 'סיבת הביטול ארוכה מדי'),
})

// F2: order status is owned by the payment/fulfillment flow (webhooks,
// finalize, redemption). The ONLY manual admin transition is
// pending -> cancelled, with a mandatory reason and an audit row.
// Refunds of paid orders belong to the refund console (037, not built yet).
async function runCancelPendingOrder(
  _: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  let session: AdminSessionInfo
  try {
    session = await requireAdminSession()
  } catch {
    return { error: 'אין הרשאה' }
  }

  const parsed = cancelSchema.safeParse({
    id: formData.get('id'),
    reason: formData.get('reason'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'קלט לא תקין' }
  }

  const supabase = await createClient()
  const { data: order } = await supabase
    .from('orders')
    .select('id, status, notes')
    .eq('id', parsed.data.id)
    .single()

  if (!order) return { error: 'הזמנה לא נמצאה' }
  if (order.status !== 'pending') {
    return {
      error:
        order.status === 'paid'
          ? 'הזמנה ששולמה אינה מבוטלת ידנית; החזר כספי מתבצע דרך מסלול ההחזרים'
          : 'רק הזמנה בסטטוס ממתין ניתנת לביטול ידני',
    }
  }

  const cancelNote = `ביטול אדמין: ${parsed.data.reason}`
  const { error } = await supabase
    .from('orders')
    .update({
      status: 'cancelled',
      notes: order.notes ? `${order.notes}\n${cancelNote}` : cancelNote,
    })
    .eq('id', parsed.data.id)
    .eq('status', 'pending')

  if (error) return { error: error.message }

  // Hand the stock back immediately rather than waiting for the hold to lapse.
  // An expired reservation stops counting against availability on its own -
  // `available_stock` filters on `expires_at` - but "on its own" can be up to
  // fifteen minutes away, and a cancelled order is stock that is known free
  // now. Best effort: a failure here costs a quarter of an hour of shelf space,
  // not a cancellation.
  const { error: releaseError } = await supabase.rpc('release_order_stock', {
    p_order_id: parsed.data.id,
  })
  if (releaseError) {
    log.warn('admin.order_cancel_stock_release_failed', {
      orderId: parsed.data.id,
      reason: releaseError.message,
    })
  }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'status_change',
    entityType: 'orders',
    entityId: parsed.data.id,
    changes: { status: { from: 'pending', to: 'cancelled' } },
    metadata: { reason: parsed.data.reason },
  })

  revalidatePath('/admin/orders')
  revalidatePath(`/admin/orders/${parsed.data.id}`)
  return { success: 'ההזמנה בוטלה' }
}

const noteSchema = z.object({
  id: z.string().uuid({ message: 'מזהה הזמנה לא תקין' }),
  note: z.string().trim().min(1, 'ההערה ריקה').max(2000, 'ההערה ארוכה מדי'),
})

/**
 * Appends a dated, attributed line to `orders.notes`.
 *
 * Appends rather than replaces: an order note is a record of what someone
 * decided and when, and the next admin overwriting it would erase the reason
 * the previous one acted. The audit_log row carries the same text, so the
 * history survives even if the column is later edited by hand.
 */
async function runAddOrderNote(_: OrderActionState, formData: FormData): Promise<OrderActionState> {
  let session: AdminSessionInfo
  try {
    session = await requireAdminSession()
  } catch {
    return { error: 'אין הרשאה' }
  }

  const parsed = noteSchema.safeParse({
    id: formData.get('id'),
    note: formData.get('note'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'נתונים לא תקינים' }
  }

  const supabase = await createClient()
  const { data: order, error: readError } = await supabase
    .from('orders')
    .select('notes')
    .eq('id', parsed.data.id)
    .single()
  if (readError) return { error: readError.message }

  // Stamped so a note read months later still says who wrote it and when.
  const stamp = new Date().toISOString()
  const line = `[${stamp}] ${session.userId}: ${parsed.data.note}`
  const next = order?.notes ? `${order.notes}\n${line}` : line

  const { error } = await supabase.from('orders').update({ notes: next }).eq('id', parsed.data.id)
  if (error) return { error: error.message }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'updated',
    entityType: 'orders',
    entityId: parsed.data.id,
    changes: { note: parsed.data.note },
  })

  revalidatePath(`/admin/orders/${parsed.data.id}`)
  return { success: 'ההערה נוספה' }
}

export async function cancelPendingOrder(
  _: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  return withActionContext('admin.order.cancel_pending', () => runCancelPendingOrder(_, formData))
}

export async function addOrderNote(
  _: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  return withActionContext('admin.order.add_note', () => runAddOrderNote(_, formData))
}
