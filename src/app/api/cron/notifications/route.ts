import { buildNotification } from '@/lib/email/notifications'
import { sendEmail } from '@/lib/email/resend'
import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { bearerMatches } from '@/lib/security/constant-time'
import { createAdminClient } from '@/lib/supabase/admin'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * Drains `notification_outbox` through Resend.
 *
 * The queue is filled in-transaction by the triggers in 095: the customer's
 * order confirmation, one sale alert per supplier, and the coupon-scanned
 * notice. Nothing here decides WHETHER an email is owed; the database already
 * did, at the moment of the event. This decides only when it goes out.
 *
 * WHY A CRON AND NOT AN EDGE FUNCTION. The goal named a Supabase trigger plus
 * an edge function. The trigger half is real and applied. The edge-function
 * half would need `pg_net` to make the call from Postgres, and that extension
 * is not installed on this project (available, `installed_version` null).
 * Installing an extension on production to gain a second delivery mechanism,
 * when a cron route with the service role already runs nightly for the voucher
 * sweep, buys nothing this queue does not already have. The durability the
 * design actually wanted comes from the outbox row, not from the transport.
 *
 * RETRIES. A send that fails is not lost and not retried immediately: attempts
 * are counted, the row is pushed out by an exponential backoff, and after five
 * it goes `dead` and stops. `dead` is a state an admin can see and requeue; it
 * is not a silent drop.
 *
 * IDEMPOTENCY. `dedupe_key` is unique in the table AND is what Resend is given
 * as its idempotency key, so the same logical email cannot be sent twice even
 * if this route runs twice over the same row.
 *
 * Auth: Vercel Cron sends Authorization: Bearer CRON_SECRET.
 */

/** One run's ceiling. A backlog drains over consecutive runs, as 068 does. */
const BATCH = 50

/** Attempts before a row is parked as dead rather than retried forever. */
const MAX_ATTEMPTS = 5

/** 2, 8, 32, 128 minutes. Long enough for a provider outage to end. */
function backoffMinutes(attempts: number): number {
  return 2 * 4 ** Math.max(0, attempts - 1)
}

type OutboxRow = {
  id: string
  kind: string
  recipient_email: string
  payload: Record<string, unknown> | null
  dedupe_key: string
  attempts: number
}

async function handleGET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET
  if (!bearerMatches(request.headers.get('authorization'), secret ?? '')) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  const admin = createAdminClient()
  const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://kenyonexpress.co.il'

  const { data, error } = await admin
    .from('notification_outbox')
    .select('id, kind, recipient_email, payload, dedupe_key, attempts')
    .eq('status', 'pending')
    .lte('next_attempt_at', new Date().toISOString())
    .order('next_attempt_at', { ascending: true })
    .limit(BATCH)

  if (error) {
    log.error('notifications.outbox_read_failed', { reason: error.message })
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  const rows = (data ?? []) as unknown as OutboxRow[]
  let sent = 0
  let skipped = 0
  let failed = 0
  let dead = 0

  for (const row of rows) {
    const built = buildNotification(row.kind, row.payload ?? {}, siteUrl)
    if (!built) {
      // A kind nothing can render will never render, however often it is
      // retried, so it is parked immediately rather than burning five attempts.
      dead++
      await admin
        .from('notification_outbox')
        .update({ status: 'dead', last_error: `no template for kind ${row.kind}` })
        .eq('id', row.id)
      continue
    }

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
      continue
    }

    // No API key is not a failure of this row. Counting it as an attempt would
    // burn the whole queue's retries on a machine that was never configured to
    // send, and the rows would be dead before anybody set the key.
    if (result.skipped) {
      skipped++
      continue
    }

    const attempts = row.attempts + 1
    const isDead = attempts >= MAX_ATTEMPTS
    if (isDead) dead++
    else failed++

    await admin
      .from('notification_outbox')
      .update({
        status: isDead ? 'dead' : 'pending',
        attempts,
        last_error: result.reason.slice(0, 500),
        next_attempt_at: new Date(Date.now() + backoffMinutes(attempts) * 60_000).toISOString(),
      })
      .eq('id', row.id)
  }

  return NextResponse.json({ ok: true, considered: rows.length, sent, skipped, failed, dead })
}

export const GET = withRequestLog('/api/cron/notifications', handleGET)
