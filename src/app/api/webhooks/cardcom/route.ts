import { createAdminClient } from '@/lib/supabase/admin'
import { generateVoucherQR } from '@/lib/vouchers/qr-generation'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * Cardcom webhook handler for payment events.
 * Processes: payment_success, payment_failed, refund events
 * Updates orders table with status transitions and voucher QR generation.
 */

interface CardcomWebhookPayload {
  event_type: 'payment_success' | 'payment_failed' | 'refund'
  order_id: string
  payment_id: string
  transaction_id?: string
  amount?: number
  failure_reason?: string
  refund_amount?: number
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const admin = createAdminClient()

  try {
    // Parse webhook payload
    const payload: CardcomWebhookPayload = await request.json()

    const { event_type, order_id, payment_id, transaction_id, failure_reason } = payload

    // Validate required fields
    if (!event_type || !order_id || !payment_id) {
      return NextResponse.json(
        { error: 'Missing required fields: event_type, order_id, payment_id' },
        { status: 400 },
      )
    }

    // Process based on event type
    switch (event_type) {
      case 'payment_success': {
        // Update payment status to succeeded
        const { error: paymentError } = await admin
          .from('payments')
          .update({
            status: 'succeeded',
            succeeded_at: new Date().toISOString(),
            cardcom_transaction_id: transaction_id,
          })
          .eq('id', payment_id)
          .in('status', ['initiated', 'redirected'])

        if (paymentError) {
          console.error('Failed to update payment:', paymentError)
          return NextResponse.json({ error: 'Failed to update payment' }, { status: 500 })
        }

        // Update order status to paid
        const { error: orderError } = await admin
          .from('orders')
          .update({
            status: 'paid',
            paid_at: new Date().toISOString(),
          })
          .eq('id', order_id)
          .eq('status', 'pending')

        if (orderError) {
          console.error('Failed to update order:', orderError)
          return NextResponse.json({ error: 'Failed to update order' }, { status: 500 })
        }

        // Check if order has coupon items - generate voucher QR
        const { data: orderItems } = await admin
          .from('order_items')
          .select('id, product_type, quantity')
          .eq('order_id', order_id)

        const hasCoupons = orderItems?.some((item) => item.product_type === 'coupon')

        if (hasCoupons) {
          // Generate voucher QR for the order
          const { data: vouchers } = await admin
            .from('vouchers')
            .select('id, code, user_id, expires_at, supplier_id')
            .eq('order_id', order_id)
            .eq('status', 'issued')

          if (vouchers && vouchers.length > 0) {
            const voucher = vouchers[0]
            if (voucher?.id && voucher.user_id && voucher.expires_at) {
              const qrUrl = await generateVoucherQR({
                voucher_id: voucher.id,
                user_id: voucher.user_id,
                expiry: new Date(voucher.expires_at),
              })

              // Update order with voucher QR URL
              await admin.from('orders').update({ voucher_qr_url: qrUrl }).eq('id', order_id)
            }
          }
        }

        return NextResponse.json({ success: true, event: 'payment_success_processed' })
      }

      case 'payment_failed': {
        // Update payment status to failed
        const { error: paymentError } = await admin
          .from('payments')
          .update({
            status: 'failed',
            failed_at: new Date().toISOString(),
            failure_code: failure_reason || 'unknown',
          })
          .eq('id', payment_id)
          .in('status', ['initiated', 'redirected'])

        if (paymentError) {
          console.error('Failed to update payment:', paymentError)
          return NextResponse.json({ error: 'Failed to update payment' }, { status: 500 })
        }

        // Order stays in pending status - can be retried
        return NextResponse.json({ success: true, event: 'payment_failed_processed' })
      }

      case 'refund': {
        // Update payment status to refunded
        const { error: paymentError } = await admin
          .from('payments')
          .update({
            status: 'refunded',
            refunded_at: new Date().toISOString(),
          })
          .eq('id', payment_id)
          .eq('status', 'succeeded')

        if (paymentError) {
          console.error('Failed to update payment:', paymentError)
          return NextResponse.json({ error: 'Failed to update payment' }, { status: 500 })
        }

        // Update order status to refunded
        const { error: orderError } = await admin
          .from('orders')
          .update({
            status: 'refunded',
            refunded_at: new Date().toISOString(),
          })
          .eq('id', order_id)
          .in('status', ['paid', 'fulfilled', 'partially_fulfilled'])

        if (orderError) {
          console.error('Failed to update order:', orderError)
          return NextResponse.json({ error: 'Failed to update order' }, { status: 500 })
        }

        // Cancel any issued vouchers
        await admin
          .from('vouchers')
          .update({
            status: 'refunded',
            refunded_at: new Date().toISOString(),
          })
          .eq('order_id', order_id)
          .eq('status', 'issued')

        return NextResponse.json({ success: true, event: 'refund_processed' })
      }

      default:
        return NextResponse.json({ error: `Unknown event type: ${event_type}` }, { status: 400 })
    }
  } catch (error) {
    console.error('Webhook processing error:', error)
    return NextResponse.json({ error: 'Internal server error processing webhook' }, { status: 500 })
  }
}
