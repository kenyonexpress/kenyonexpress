import { buildNotification } from '@/lib/email/notifications'
import { sendEmail } from '@/lib/email/resend'
import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { cronSecretMatches } from '@/lib/security/constant-time'
import { createAdminClient } from '@/lib/supabase/admin'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * Scheduled gift delivery cron - runs every 10 minutes.
 *
 * Checks notification_outbox for gift emails where gift_scheduled_at <= now
 * AND not yet sent, then sends them via Resend.
 *
 * Flow:
 * 1. Find voucher_gifted rows in notification_outbox where:
 *    - status = 'pending'
 *    - next_attempt_at <= now (this is set to gift_scheduled_at at queue time)
 * 2. For each row, build gift email template F49 with:
 *    - Coupon code (claim token)
 *    - Personal message
 *    - Link to redeem
 * 3. Send via Resend
 * 4. Update status to 'sent' and set sent_at
 *
 * Recipient must create account to redeem the gift (handled by claim flow).
 *
 * Auth: Vercel Cron sends x-cron-secret header.
 */

const BATCH = 50

type GiftOutboxRow = {
  id: string
  kind: string
  recipient_email: string
  payload: Record<string, unknown> | null
  dedupe_key: string
  attempts: number
  status: string
  next_attempt_at: string
}

async function handleGET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET
  const cronHeader = request.headers.get('x-cron-secret')

  if (!cronSecretMatches(cronHeader, secret ?? '')) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  const admin = createAdminClient()
  const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://kenyonexpress.co.il'
  const now = new Date().toISOString()

  // Find scheduled gifts that are due (gift_scheduled_at <= now AND not_sent)
  const { data, error } = await admin
    .from('notification_outbox')
    .select('id, kind, recipient_email, payload, dedupe_key, attempts, status, next_attempt_at')
    .eq('kind', 'voucher_gifted')
    .eq('status', 'pending')
    .lte('next_attempt_at', now)
    .order('created_at', { ascending: true })
    .limit(BATCH)

  if (error) {
    log.error('scheduled_gifts.read_failed', { reason: error.message })
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  const rows = (data ?? []) as unknown as GiftOutboxRow[]
  let sent = 0
  let failed = 0

  for (const row of rows) {
    // Build gift email template F49
    const built = buildNotification(row.kind, row.payload ?? {}, siteUrl)
    if (!built) {
      log.warn('scheduled_gifts.no_template', { row_id: row.id })
      await admin
        .from('notification_outbox')
        .update({ status: 'dead', last_error: 'no template for voucher_gifted' })
        .eq('id', row.id)
      continue
    }

    // Send gift email with coupon code, personal message, and claim link
    const result = await sendEmail({
      to: row.recipient_email,
      subject: built.subject,
      html: built.html,
      text: built.text,
      idempotencyKey: row.dedupe_key,
    })

    if (result.ok) {
      sent++
      await admin
        .from('notification_outbox')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          attempts: row.attempts + 1,
          last_error: null,
        })
        .eq('id', row.id)
      log.info('scheduled_gifts.sent', { row_id: row.id, recipient: row.recipient_email })
    } else {
      failed++
      const attempts = row.attempts + 1
      const isDead = attempts >= 5
      await admin
        .from('notification_outbox')
        .update({
          status: isDead ? 'dead' : 'pending',
          attempts,
          last_error: result.reason?.slice(0, 500) ?? 'send failed',
          next_attempt_at: new Date(Date.now() + 2 * 60_000).toISOString(), // retry in 2 min
        })
        .eq('id', row.id)
      log.error('scheduled_gifts.send_failed', {
        row_id: row.id,
        attempts,
        reason: result.reason,
      })
    }
  }

  return NextResponse.json({
    ok: true,
    processed: rows.length,
    sent,
    failed,
    message:
      sent > 0 ? `Sent ${sent} scheduled gift${sent === 1 ? '' : 's'}` : 'No scheduled gifts due',
  })
}

export const GET = withRequestLog('/api/cron/scheduled-gifts', handleGET)
