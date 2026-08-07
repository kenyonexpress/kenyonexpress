'use server'

import { withActionContext } from '@/lib/observability/action-context'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export type OrderPollResult = { found: false } | { found: true; status: string; paid: boolean }

/** Poll target for /checkout/return — read-only, never mutates order state. */
async function runGetOrderPaymentStatus(orderId: string): Promise<OrderPollResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { found: false }

  const admin = createAdminClient()
  const { data: order } = await admin
    .from('orders')
    .select('id, status, paid_at')
    .eq('id', orderId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!order) return { found: false }
  return { found: true, status: order.status, paid: order.paid_at !== null }
}

export async function getOrderPaymentStatus(orderId: string): Promise<OrderPollResult> {
  return withActionContext('order.poll_payment_status', () => runGetOrderPaymentStatus(orderId))
}
