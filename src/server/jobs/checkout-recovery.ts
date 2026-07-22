import { createAdminClient } from '@/lib/supabase/admin'
import { toLegacyOrderStatus } from '@/server/domain/orders/lifecycle'
import type { OrderLifecycleStatus } from '@/server/domain/orders/lifecycle'
import { planLifecycleTransition } from '@/server/domain/orders/lifecycle-audit'

export type RecoverySummary = {
  expiredOrders: number
  abandonedCarts: number
  at: string
}

/**
 * Cancels pending orders past expires_at and counts stale carts.
 * Intended for Vercel Cron every 15 minutes.
 */
export async function runCheckoutRecoveryJob(now = new Date()): Promise<RecoverySummary> {
  const admin = createAdminClient()
  const nowIso = now.toISOString()

  const { data: expired, error } = await admin
    .from('orders')
    .select('id, status')
    .eq('status', 'pending')
    .lt('expires_at', nowIso)
    .is('deleted_at', null)
    .limit(200)

  if (error) throw new Error(error.message)

  let expiredOrders = 0
  for (const row of expired ?? []) {
    const from = (row.status as OrderLifecycleStatus) ?? 'pending'
    const plan = planLifecycleTransition({
      from,
      event: 'EXPIRE',
      actor: 'cron',
      payload: { reason: 'pending_ttl' },
    })

    const { error: updErr } = await admin
      .from('orders')
      .update({ status: toLegacyOrderStatus(plan.to) })
      .eq('id', row.id)
      .eq('status', 'pending')

    if (updErr) continue

    await admin.from('order_status_audit').insert({
      order_id: row.id,
      from_status: plan.audit.from_status,
      to_status: plan.audit.to_status,
      event: plan.audit.event,
      actor: plan.audit.actor,
      payload: plan.audit.payload,
    })
    expiredOrders += 1
  }

  const dayAgo = new Date(now.getTime() - 24 * 60 * 60_000).toISOString()
  const { count: abandonedCarts } = await admin
    .from('carts')
    .select('id', { count: 'exact', head: true })
    .lt('updated_at', dayAgo)

  return {
    expiredOrders,
    abandonedCarts: abandonedCarts ?? 0,
    at: nowIso,
  }
}
