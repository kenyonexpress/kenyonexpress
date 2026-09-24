import { log } from '@/lib/observability/log'
import type { createAdminClient } from '@/lib/supabase/admin'

type Admin = ReturnType<typeof createAdminClient>

/**
 * Is this the customer's first PAID order?
 *
 * True only when the order belongs to an account and that account has exactly
 * one paid order. A guest order (no `user_id`), a failed read and a repeat
 * customer all answer false, so the banner never appears on a guess.
 */
export async function isFirstPaidOrder(admin: Admin, orderId: string): Promise<boolean> {
  const { data: order, error } = await admin
    .from('orders')
    .select('user_id')
    .eq('id', orderId)
    .maybeSingle()
  if (error) {
    log.warn('first_purchase.order_read_failed', { reason: error.message })
    return false
  }
  const userId = (order as { user_id?: string | null } | null)?.user_id
  if (!userId) return false

  const { count, error: countError } = await admin
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .not('paid_at', 'is', null)
  if (countError) {
    log.warn('first_purchase.count_failed', { reason: countError.message })
    return false
  }
  return count === 1
}
