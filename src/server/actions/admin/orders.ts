'use server'

import { writeAuditLog } from '@/lib/admin/audit'
import { ORDER_STATUS_LABELS } from '@/lib/admin/labels'
import { type AdminSessionInfo, requireAdminSession } from '@/lib/admin/rbac'
import type { OrderStatus } from '@/lib/checkout/state-machine'
import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import { createClient } from '@/lib/supabase/server'
import { canAdminOverride, effectsFor } from '@/server/domain/orders/order-transitions'
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
// finalize, redemption). Manual moves go through the override policy in
// order-transitions.ts; this dedicated cancel action predates it and keeps
// the one-click pending -> cancelled path, with a mandatory reason and an
// audit row. Refunds of paid orders belong to the refund console.
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

  // The discount code's use goes back with the stock, and for the same reason.
  // A cancelled order that keeps its claim spends a one-per-customer code on a
  // sale that never happened, and the customer cannot use it again -- a refusal
  // they have no way to understand and support has no way to explain.
  //
  // Best effort and never fatal, like the line above: an unreleased claim costs
  // one use of one code, a thrown error costs the cancellation.
  const { error: discountReleaseError } = await supabase.rpc('release_order_discount', {
    p_order_id: parsed.data.id,
  })
  if (discountReleaseError) {
    log.warn('admin.order_cancel_discount_release_failed', {
      orderId: parsed.data.id,
      reason: discountReleaseError.message,
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

const overrideSchema = z.object({
  id: z.string().uuid({ message: 'מזהה הזמנה לא תקין' }),
  // The money states are absent on purpose, not merely rejected later:
  // `paid` exists only when finalize.ts confirmed a real charge and
  // `refunded` only when the refund console moved real money back. The
  // policy in order-transitions.ts enforces the same rule server-side.
  to: z.enum(['partially_fulfilled', 'fulfilled', 'cancelled'], {
    message: 'סטטוס יעד לא תקין',
  }),
  reason: z
    .string()
    .trim()
    .min(3, 'חובה לציין סיבה לשינוי הסטטוס (לפחות 3 תווים)')
    .max(500, 'הסיבה ארוכה מדי'),
})

/**
 * Admin state override: assert a fulfilment fact by hand, with a mandatory
 * reason and a `manual_override` audit row.
 *
 * The move must be legal in `orderMachine` AND overridable per
 * `canAdminOverride`: which together allow exactly the fulfilment lane
 * (paid -> partially_fulfilled -> fulfilled) and pending -> cancelled. The
 * side effects are not chosen here: `effectsFor` returns the declared plan
 * for the edge and this action executes it, so a writer added later runs the
 * same hooks instead of remembering its own subset.
 */
async function runOverrideOrderStatus(
  _: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  let session: AdminSessionInfo
  try {
    session = await requireAdminSession()
  } catch {
    return { error: 'אין הרשאה' }
  }

  const parsed = overrideSchema.safeParse({
    id: formData.get('id'),
    to: formData.get('to'),
    reason: formData.get('reason'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'קלט לא תקין' }
  }
  const { id, to, reason } = parsed.data

  const supabase = await createClient()
  const { data: order, error: readError } = await supabase
    .from('orders')
    .select('id, status, notes')
    .eq('id', id)
    .single()
  if (readError || !order) return { error: 'הזמנה לא נמצאה' }

  const from = order.status as OrderStatus
  if (!canAdminOverride(from, to)) {
    return {
      error: `אין מעבר ידני מ"${ORDER_STATUS_LABELS[from]}" ל"${ORDER_STATUS_LABELS[to]}"`,
    }
  }
  const effects = effectsFor(from, to) ?? []

  const update: { status: OrderStatus; notes?: string } = { status: to }
  if (effects.includes('append_note')) {
    const stamp = new Date().toISOString()
    const line = `[${stamp}] ${session.userId}: שינוי סטטוס ידני ${ORDER_STATUS_LABELS[from]} > ${ORDER_STATUS_LABELS[to]}: ${reason}`
    update.notes = order.notes ? `${order.notes}\n${line}` : line
  }

  // CAS on the source status: if another writer moved the order between the
  // read and this write, zero rows match and the admin sees the race instead
  // of silently overwriting the newer state.
  const { data: moved, error } = await supabase
    .from('orders')
    .update(update)
    .eq('id', id)
    .eq('status', from)
    .select('id')
    .maybeSingle()
  if (error) return { error: error.message }
  if (!moved) return { error: 'הסטטוס השתנה בינתיים על ידי תהליך אחר. רענן ונסה שוב.' }

  if (effects.includes('release_stock')) {
    // Best effort, same as the cancel path: an expired reservation frees
    // itself within minutes, so a failure here costs shelf time, not the move.
    const { error: releaseError } = await supabase.rpc('release_order_stock', {
      p_order_id: id,
    })
    if (releaseError) {
      log.warn('admin.order_override_stock_release_failed', {
        orderId: id,
        reason: releaseError.message,
      })
    }

    // Same pairing as the cancel path. `release_stock` is the effect that means
    // "this order is not going to happen", and a discount claim is held on
    // exactly the same premise.
    const { error: discountReleaseError } = await supabase.rpc('release_order_discount', {
      p_order_id: id,
    })
    if (discountReleaseError) {
      log.warn('admin.order_override_discount_release_failed', {
        orderId: id,
        reason: discountReleaseError.message,
      })
    }
  }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'manual_override',
    entityType: 'orders',
    entityId: id,
    changes: { status: { from, to } },
    metadata: { reason },
  })

  revalidatePath('/admin/orders')
  revalidatePath(`/admin/orders/${id}`)
  return { success: `הסטטוס עודכן ל"${ORDER_STATUS_LABELS[to]}"` }
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

export async function overrideOrderStatus(
  _: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  return withActionContext('admin.order.override_status', () => runOverrideOrderStatus(_, formData))
}
