import { buildNotification } from '@/lib/email/notifications'
import { sendEmail } from '@/lib/email/resend'
import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { bearerMatches } from '@/lib/security/constant-time'
import { createAdminClient } from '@/lib/supabase/admin'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * Scheduled gift delivery cron - runs every 10 minutes.
 *
 * Checks orders.gift_scheduled_at <= now AND not_sent per F59 spec.
 *
 * Flow:
 * 1. Query orders where gift_scheduled_at <= now
 * 2. For each order, find vouchers where gift_sent_at IS NULL (not_sent)
 * 3. Build gift email template F49 with coupon code, message, claim link
 * 4. Send via Resend
 * 5. Mark vouchers.gift_sent_at to record sent
 *
 * Requires migration 305 (gift_scheduled_at column).
 * Falls back gracefully if column doesn't exist.
 *
 * Auth: Bearer token from Vercel Cron.
 */

const BATCH = 50

async function handleGET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')

  if (!bearerMatches(authHeader, secret ?? '')) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  const admin = createAdminClient()
  const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.kenyonexpress.co.il'
  const now = new Date().toISOString()

  // Check orders where gift_scheduled_at <= now
  const { data: orders, error: ordersError } = await admin
    .from('orders')
    .select('id, gift_recipient_email, gift_recipient_name, gift_message')
    .not('gift_recipient_email', 'is', null)
    .lte('gift_scheduled_at' as never, now)
    .limit(BATCH)

  // Graceful fallback if migration 305 not applied
  if (ordersError?.code === '42703') {
    log.warn('scheduled_gifts.column_missing', {
      hint: 'Migration 305 required for gift_scheduled_at column',
    })
    return NextResponse.json({
      ok: true,
      processed: 0,
      sent: 0,
      message: 'Migration 305 required',
    })
  }

  if (ordersError) {
    log.error('scheduled_gifts.orders_failed', { reason: ordersError.message })
    return NextResponse.json({ ok: false, error: ordersError.message }, { status: 500 })
  }

  const dueOrders = (orders ?? []) as {
    id: string
    gift_recipient_email: string
    gift_recipient_name: string | null
    gift_message: string | null
  }[]

  let sent = 0
  let failed = 0

  for (const order of dueOrders) {
    // Find vouchers not yet sent (not_sent check via gift_sent_at IS NULL)
    const { data: vouchers, error: vouchersError } = await admin
      .from('vouchers')
      .select('id, product_id, expires_at, gift_claim_token_hash')
      .eq('order_id', order.id)
      .is('gift_sent_at', null)
      .eq('status', 'issued')

    if (vouchersError) {
      failed++
      log.error('scheduled_gifts.vouchers_failed', {
        order_id: order.id,
        reason: vouchersError.message,
      })
      continue
    }
    if (!vouchers || vouchers.length === 0) continue

    for (const voucher of vouchers) {
      // Build gift email template F49
      const built = buildNotification(
        'voucher_gifted',
        {
          product_name: null,
          recipient_name: order.gift_recipient_name,
          gift_message: order.gift_message,
          claim_token: voucher.gift_claim_token_hash || '',
          expires_at: voucher.expires_at,
        },
        siteUrl,
      )

      if (!built) {
        failed++
        continue
      }

      // Send with coupon code, personal message, claim link
      const result = await sendEmail({
        to: order.gift_recipient_email,
        subject: built.subject,
        html: built.html,
        text: built.text,
        idempotencyKey: `gift:${voucher.id}`,
      })

      if (result.ok) {
        await admin
          .from('vouchers')
          .update({ gift_sent_at: new Date().toISOString() } as never)
          .eq('id', voucher.id)
        sent++
      } else {
        failed++
        log.error('scheduled_gifts.send_failed', {
          order_id: order.id,
          reason: result.reason,
        })
      }
    }
  }

  return NextResponse.json({
    ok: true,
    processed: dueOrders.length,
    sent,
    failed,
    message: sent > 0 ? `Sent ${sent} scheduled gift${sent === 1 ? '' : 's'}` : 'No gifts due',
  })
}

export const GET = withRequestLog('/api/cron/scheduled-gifts', handleGET)
