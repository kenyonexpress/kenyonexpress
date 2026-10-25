import { notifyNewOrder } from '@/lib/notifications'
import { createClient } from '@/lib/supabase/server'
import { type NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { orderId } = body as { orderId?: string }

    if (!orderId) {
      return NextResponse.json({ error: 'orderId required' }, { status: 400 })
    }

    // Fetch order details
    const supabase = await createClient()
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, status, total_ils_agorot')
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      console.error('[order-paid] order not found:', orderId, orderError)
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

    // Fetch first order item for product title
    const { data: items } = await supabase
      .from('order_items')
      .select('product_title')
      .eq('order_id', orderId)
      .limit(1)

    const productTitle = items?.[0]?.product_title ?? 'מוצר'

    // Send notification
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
    console.error('[order-paid] webhook error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
