import { notifyNewOrder } from '@/lib/notifications'
import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { bearerMatches } from '@/lib/security/constant-time'
import { createAdminClient } from '@/lib/supabase/admin'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * Internal hop from the Cardcom webhook: a paid order fires an admin alert.
 * Called server to server with no session, so it authenticates with the cron
 * Bearer secret and reads through the admin client.
 */
async function handlePOST(req: NextRequest): Promise<NextResponse> {
  if (!bearerMatches(req.headers.get('authorization'), process.env.CRON_SECRET ?? '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { orderId } = body as { orderId?: string }

    if (!orderId) {
      return NextResponse.json({ error: 'orderId required' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, status, total_ils_agorot')
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      log.warn('order_paid.order_not_found', { order_id: orderId, err: orderError })
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // Only notify on paid orders
    if (order.status !== 'paid') {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: `Order status is ${order.status}, not paid`,
      })
    }

    // First order item supplies the product title; a failed read falls back.
    const { data: items, error: itemsError } = await supabase
      .from('order_items')
      .select('product_title')
      .eq('order_id', orderId)
      .limit(1)

    if (itemsError) log.warn('order_paid.items_read_failed', { order_id: orderId, err: itemsError })

    const productTitle = items?.[0]?.product_title ?? 'מוצר'

    await notifyNewOrder({
      orderId: order.id,
      productTitle,
      amountAgorot: order.total_ils_agorot,
    })

    return NextResponse.json({
      ok: true,
      orderId: order.id,
      notified: true,
    })
  } catch (err) {
    log.error('order_paid.webhook_failed', { err })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export const POST = withRequestLog('/api/webhooks/order-paid', handlePOST)
