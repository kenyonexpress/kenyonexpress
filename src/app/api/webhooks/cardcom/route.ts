import { createHmac, timingSafeEqual } from 'node:crypto'
import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateSignedJWT } from '@/lib/vouchers/qr-generation'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * Cardcom webhook handler for payment events.
 * Validates HMAC signature, processes payment_success/payment_failed/refund events.
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
  signature: string
}

/**
 * Validate webhook signature using HMAC-SHA256.
 * Timing-safe comparison to prevent timing attacks.
 */
function validateSignature(payload: string, signature: string): boolean {
  const secret = process.env.CARDCOM_WEBHOOK_SECRET
  if (!secret) {
    log.error('cardcom_webhook_secret_not_set')
    return false
  }

  const expectedSignature = createHmac('sha256', secret).update(payload).digest('hex')

  if (signature.length !== expectedSignature.length) {
    return false
  }

  return timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expectedSignature, 'hex'))
}

async function handlePOST(request: NextRequest): Promise<NextResponse> {
  const admin = createAdminClient()

  try {
    // Get raw body and parse payload
    const rawBody = await request.text()
    const payload: CardcomWebhookPayload = JSON.parse(rawBody)

    const { event_type, order_id, payment_id, transaction_id, failure_reason, signature } = payload

    // Validate signature (calculated on payload without signature field)
    if (!signature) {
      log.error('missing_webhook_signature')
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    // Reconstruct payload without signature for validation
    const { signature: _, ...payloadWithoutSignature } = payload
    const payloadForValidation = JSON.stringify(payloadWithoutSignature)

    if (!validateSignature(payloadForValidation, signature)) {
      log.error('invalid_webhook_signature')
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

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
          log.error('failed_to_update_payment', { err: paymentError })
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
          log.error('failed_to_update_order', { err: orderError })
          return NextResponse.json({ error: 'Failed to update order' }, { status: 500 })
        }

        // Check if order has coupon items - generate voucher QR
        const { data: orderItems, error: orderItemsError } = await admin
          .from('order_items')
          .select('id, product_type, quantity')
          .eq('order_id', order_id)

        if (orderItemsError) {
          log.error('order_items_read_failed', { err: orderItemsError })
        }

        const hasCoupons = orderItems?.some((item) => item.product_type === 'coupon')

        if (hasCoupons) {
          // Generate voucher QR for the order
          const { data: vouchers, error: vouchersError } = await admin
            .from('vouchers')
            .select('id, code, user_id, expires_at, supplier_id')
            .eq('order_id', order_id)
            .eq('status', 'issued')

          if (vouchersError) {
            log.error('vouchers_read_failed', { err: vouchersError })
          }

          if (vouchers && vouchers.length > 0) {
            const voucher = vouchers[0]
            if (voucher?.id && voucher.user_id && voucher.expires_at) {
              // Generate JWT (not data URL) for QR code
              const jwt = generateSignedJWT({
                voucher_id: voucher.id,
                user_id: voucher.user_id,
                expiry: new Date(voucher.expires_at),
              })

              // Store JWT directly in orders.voucher_qr_url
              await admin.from('orders').update({ voucher_qr_url: jwt }).eq('id', order_id)
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
          log.error('failed_to_update_payment', { err: paymentError })
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
          log.error('failed_to_update_payment', { err: paymentError })
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
          log.error('failed_to_update_order', { err: orderError })
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
    log.error('webhook_processing_error', { err: error })
    return NextResponse.json({ error: 'Internal server error processing webhook' }, { status: 500 })
  }
}

export const POST = withRequestLog('/api/webhooks/cardcom', handlePOST)
