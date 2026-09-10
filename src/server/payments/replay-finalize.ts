import { finalizeOrder } from '@/server/payments/finalize'
import type { FinalizeForReplay } from '@/server/payments/webhook-dlq'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * A dead letter knows its payment. `finalizeOrder` needs the order and the
 * transaction. This is the one hop between them, and it exists once because
 * both replay paths - the ten-minute sweep and the button in `/admin/queues` -
 * must close an order the same way. Two copies would be two ways to close an
 * order, and the difference would only show up in the money.
 *
 * NOTHING HERE CONTACTS CARDCOM. The charge was already verified against the
 * provider's own API before the row became a dead letter; re-asking would be a
 * second opinion on a settled question, and would make the replay fail whenever
 * the provider is down - which is one of the reasons finalize failed in the
 * first place.
 */
export function finalizeForReplay(admin: Pick<SupabaseClient, 'from'>): FinalizeForReplay {
  return async (paymentId: string) => {
    const { data, error } = await admin
      .from('payments')
      .select('id, order_id, cardcom_transaction_id')
      .eq('id', paymentId)
      .maybeSingle()

    if (error) return { ok: false, error: `payment read failed: ${error.message}` }
    const payment = data as {
      id: string
      order_id: string
      cardcom_transaction_id: string | null
    } | null
    if (!payment) return { ok: false, error: 'payment row not found' }

    const result = await finalizeOrder({
      orderId: payment.order_id,
      paymentId: payment.id,
      transactionId: payment.cardcom_transaction_id,
    })
    return result.ok ? { ok: true } : { ok: false, error: `${result.code}: ${result.error}` }
  }
}
