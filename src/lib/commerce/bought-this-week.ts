import { PAID_ORDER_STATUSES, sumRealUnits, weekWindowStart } from '@/lib/commerce/social-proof'
import { log } from '@/lib/observability/log'
import { isRealChargeId } from '@/lib/payments/mock-transaction-id'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Units of one product on orders paid in the trailing week THROUGH A REAL
 * CHARGE. The rule and the reason are in `lib/commerce/social-proof.ts`; this
 * file is the two reads.
 *
 * WHY TWO QUERIES AND NOT ONE JOIN. PostgREST can filter `order_items` through
 * `orders!inner`, but a third hop into `payments` to test the provider id is
 * where embedded filters stop composing cleanly. The order ids from the first
 * read bound the second, and both are indexed (`order_items.product_id`,
 * `payments.order_id`).
 *
 * WHY THE ADMIN CLIENT. `orders` and `payments` are the customer's own rows
 * under RLS; a shopper on a product page holds none of them. The result is one
 * integer, and nothing about any order reaches the page.
 *
 * WHY IT IS NOT IN THE CACHED PRODUCT LOAD. Like the scarcity line, this moves
 * between requests, so it renders behind its own Suspense boundary and never
 * drags the page out of the cache.
 *
 * NEVER THROWS. An unreadable count is zero, and zero is silence.
 */
export async function readBoughtThisWeek(
  productId: string,
  now: Date = new Date(),
): Promise<number> {
  try {
    const admin = createAdminClient()
    const { data: items, error: itemsError } = await admin
      .from('order_items')
      .select('order_id, quantity, orders!inner(id)')
      .eq('product_id', productId)
      .is('deleted_at', null)
      .not('item_status', 'in', '(cancelled,refunded)')
      .gte('orders.paid_at', weekWindowStart(now))
      .in('orders.status', [...PAID_ORDER_STATUSES])
      .is('orders.deleted_at', null)

    if (itemsError) {
      log.warn('social_proof.items_read_failed', { productId, reason: itemsError.message })
      return 0
    }
    const rows = (items ?? []) as ReadonlyArray<{ order_id: string; quantity: number }>
    if (rows.length === 0) return 0

    const orderIds = [...new Set(rows.map((row) => row.order_id))]
    const { data: payments, error: paymentsError } = await admin
      .from('payments')
      .select('order_id, cardcom_transaction_id')
      .in('order_id', orderIds)
      .eq('status', 'succeeded')
      .eq('kind', 'charge')

    if (paymentsError) {
      log.warn('social_proof.payments_read_failed', { productId, reason: paymentsError.message })
      return 0
    }

    const realOrders = new Set<string>()
    for (const payment of payments ?? []) {
      if (isRealChargeId(payment.cardcom_transaction_id)) realOrders.add(payment.order_id)
    }
    return sumRealUnits(rows, realOrders)
  } catch (error) {
    log.warn('social_proof.read_threw', {
      productId,
      reason: error instanceof Error ? error.message : 'unknown',
    })
    return 0
  }
}
