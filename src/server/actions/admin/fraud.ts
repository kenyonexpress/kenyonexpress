'use server'

import { writeAuditLog } from '@/lib/admin/audit'
import { requireSection } from '@/lib/admin/rbac'
import { withActionContext } from '@/lib/observability/action-context'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

/**
 * Fraud review, the human half of the checkout fraud rail (src/lib/fraud).
 *
 * Three moves, all money-adjacent so all behind the payments section: resolve
 * a queue item (approve the customer or block them), flag an order's customer
 * as charged-back, and clear a flag. A live 'chargeback' or 'manual' flag is
 * what beginCheckout refuses on, so blocking and clearing here IS the switch
 * on that customer's ability to pay. Every decision lands in the audit log.
 *
 * The two tables are newer than the generated types, hence `as never`, the
 * codebase's marker for exactly that state (see review-queue.ts).
 */

export type FraudActionState = { ok: boolean; error?: string } | null

const UUID = /^[0-9a-f-]{36}$/i

async function runResolveFraudReview(formData: FormData): Promise<FraudActionState> {
  const session = await requireSection('payments', 'write')

  const itemId = String(formData.get('item_id') ?? '')
  const decision = String(formData.get('decision') ?? '')
  const notes = String(formData.get('notes') ?? '').trim() || null
  if (!UUID.test(itemId) || (decision !== 'approved' && decision !== 'blocked')) {
    return { ok: false, error: 'קלט לא תקין.' }
  }

  const admin = createAdminClient()
  const { data: item, error } = await admin
    .from('fraud_review_queue' as never)
    .update({
      status: decision,
      notes,
      reviewed_by: session.userId,
      reviewed_at: new Date().toISOString(),
    } as never)
    .eq('id' as never, itemId as never)
    .eq('status' as never, 'pending' as never)
    .select('id, user_id, order_id, kind')
    .maybeSingle()
  if (error) {
    return { ok: false, error: 'העדכון נכשל.' }
  }
  // Already resolved (or gone): two reviewers raced, refresh shows the truth.
  if (!item) return { ok: true }

  const row = item as { id: string; user_id: string; order_id: string | null; kind: string }

  // Blocking is not just closing the queue item: it plants the flag that
  // beginCheckout refuses on, so the customer cannot start another charge
  // until somebody clears it.
  if (decision === 'blocked') {
    const { error: flagError } = await admin.from('fraud_flags' as never).insert({
      user_id: row.user_id,
      order_id: row.order_id,
      kind: 'manual',
      reason: notes ?? `fraud review ${row.kind}`,
      created_by: session.userId,
    } as never)
    if (flagError) {
      return { ok: false, error: 'הפריט נסגר אבל יצירת החסימה נכשלה. נסו לחסום שוב.' }
    }
  }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'status_change',
    entityType: 'fraud_review',
    entityId: row.id,
    changes: { status: { from: 'pending', to: decision }, kind: row.kind },
  })

  revalidatePath('/admin/fraud')
  return { ok: true }
}

async function runFlagOrderChargeback(formData: FormData): Promise<FraudActionState> {
  const session = await requireSection('payments', 'write')

  const orderId = String(formData.get('order_id') ?? '').trim()
  const reason = String(formData.get('reason') ?? '').trim()
  if (!UUID.test(orderId)) {
    return { ok: false, error: 'מזהה הזמנה לא תקין.' }
  }
  if (!reason) {
    return { ok: false, error: 'נדרשת סיבה.' }
  }

  const admin = createAdminClient()
  const { data: order, error: orderError } = await admin
    .from('orders')
    .select('id, user_id')
    .eq('id', orderId)
    .maybeSingle()
  if (orderError) {
    return { ok: false, error: 'קריאת ההזמנה נכשלה.' }
  }
  if (!order?.user_id) {
    return { ok: false, error: 'הזמנה לא נמצאה.' }
  }

  const { data: flag, error: flagError } = await admin
    .from('fraud_flags' as never)
    .insert({
      user_id: order.user_id,
      order_id: order.id,
      kind: 'chargeback',
      reason,
      created_by: session.userId,
    } as never)
    .select('id')
    .single()
  if (flagError || !flag) {
    return { ok: false, error: 'יצירת הדגל נכשלה.' }
  }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'created',
    entityType: 'fraud_flag',
    entityId: (flag as { id: string }).id,
    changes: { kind: 'chargeback', order_id: order.id, reason },
  })

  revalidatePath('/admin/fraud')
  return { ok: true }
}

async function runClearFraudFlag(formData: FormData): Promise<FraudActionState> {
  const session = await requireSection('payments', 'write')

  const flagId = String(formData.get('flag_id') ?? '')
  if (!UUID.test(flagId)) {
    return { ok: false, error: 'קלט לא תקין.' }
  }

  const admin = createAdminClient()
  const { data: cleared, error } = await admin
    .from('fraud_flags' as never)
    .update({
      cleared_at: new Date().toISOString(),
      cleared_by: session.userId,
    } as never)
    .eq('id' as never, flagId as never)
    .is('cleared_at' as never, null)
    .select('id, kind, user_id')
    .maybeSingle()
  if (error) {
    return { ok: false, error: 'העדכון נכשל.' }
  }
  if (!cleared) return { ok: true }

  const row = cleared as { id: string; kind: string; user_id: string }
  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'status_change',
    entityType: 'fraud_flag',
    entityId: row.id,
    changes: { cleared: { from: false, to: true }, kind: row.kind },
  })

  revalidatePath('/admin/fraud')
  return { ok: true }
}

export async function resolveFraudReview(
  _prev: FraudActionState,
  formData: FormData,
): Promise<FraudActionState> {
  return withActionContext('admin.fraud.resolve_review', () => runResolveFraudReview(formData))
}

export async function flagOrderChargeback(
  _prev: FraudActionState,
  formData: FormData,
): Promise<FraudActionState> {
  return withActionContext('admin.fraud.flag_chargeback', () => runFlagOrderChargeback(formData))
}

export async function clearFraudFlag(
  _prev: FraudActionState,
  formData: FormData,
): Promise<FraudActionState> {
  return withActionContext('admin.fraud.clear_flag', () => runClearFraudFlag(formData))
}
