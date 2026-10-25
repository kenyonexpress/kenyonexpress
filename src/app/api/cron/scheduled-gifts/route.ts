import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { cronSecretMatches } from '@/lib/security/constant-time'
import { createAdminClient } from '@/lib/supabase/admin'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * Scheduled gift delivery cron.
 *
 * Runs every 10 minutes to process gift vouchers whose scheduled send time has
 * arrived. This is a specialized view of the notification_outbox queue: it
 * looks only for voucher_gifted rows whose next_attempt_at is now or past.
 *
 * The actual email sending happens via /api/cron/notifications, which processes
 * ALL notification_outbox rows. This route exists as a dedicated entry point
 * for the gift-sending concern, making it easier to monitor and control the
 * gift delivery schedule independently of other notifications.
 *
 * Flow:
 * 1. Gift purchase completed -> finalize.ts calls sendOrderGifts
 * 2. sendOrderGifts inserts voucher_gifted row into notification_outbox
 * 3. If gift_send_at is future, sets next_attempt_at to that time
 * 4. This cron (or /api/cron/notifications) picks up due rows
 * 5. buildNotification renders gift email template
 * 6. Email sent via Resend with gift claim link
 *
 * Auth: Vercel Cron sends x-cron-secret header.
 */

async function handleGET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET
  const cronHeader = request.headers.get('x-cron-secret')

  if (!cronSecretMatches(cronHeader, secret ?? '')) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  const admin = createAdminClient()
  const now = new Date().toISOString()

  // Count how many scheduled gifts are due
  const { count, error: countError } = await admin
    .from('notification_outbox')
    .select('*', { count: 'exact', head: true })
    .eq('kind', 'voucher_gifted')
    .eq('status', 'pending')
    .lte('next_attempt_at', now)

  if (countError) {
    log.error('scheduled_gifts.count_failed', { reason: countError.message })
    return NextResponse.json({ ok: false, error: countError.message }, { status: 500 })
  }

  const due = count ?? 0

  // Log for monitoring
  log.info('scheduled_gifts.check', { due, now })

  // The actual sending is handled by /api/cron/notifications, which processes
  // all notification_outbox rows including gifts. This route just reports how
  // many gift emails are scheduled and due.
  //
  // To trigger immediate processing, you can call /api/cron/notifications
  // directly. This separation allows:
  // - Dedicated monitoring of gift delivery schedule
  // - Independent rate limiting if needed
  // - Clear audit trail of scheduled vs immediate gifts

  return NextResponse.json({
    ok: true,
    due,
    message: due > 0 ? `${due} scheduled gifts are due` : 'No scheduled gifts due',
  })
}

export const GET = withRequestLog('/api/cron/scheduled-gifts', handleGET)
