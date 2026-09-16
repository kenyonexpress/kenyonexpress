import { resurrectDeadEmails } from '@/lib/email/outbox-retry'
import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { bearerMatches } from '@/lib/security/constant-time'
import { createAdminClient } from '@/lib/supabase/admin'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * The email queue's second chance, four times a day.
 *
 * `/api/cron/notifications` is the queue's retry loop: five attempts with an
 * exponential backoff, then `dead`. This route is what happens after `dead`
 * when the reason was the provider's and not the row's. It moves nothing
 * itself and sends nothing; it puts eligible rows back to `pending` and the
 * drainer's next five-minute run sends them, through the same idempotency
 * key, so a row that was in fact delivered and misreported cannot go twice.
 *
 * The whole rule is in `lib/email/outbox-retry.ts`, kept pure so it can be
 * tested row by row. This file is the auth gate and the log line.
 *
 * Auth: the scheduler sends Authorization: Bearer CRON_SECRET.
 */
async function handleGET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET
  if (!bearerMatches(request.headers.get('authorization'), secret ?? '')) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  try {
    const summary = await resurrectDeadEmails(createAdminClient(), new Date())
    if (summary.requeued > 0) {
      // Loud enough to notice: every requeue here is a provider outage that
      // outlasted the drainer's three hours of retries.
      log.warn('email_retry.resurrected', { ...summary })
    } else if (summary.permanent > 0) {
      // Rows only an operator can fix, and nobody has been looking.
      log.warn('email_retry.permanent_dead_rows', { permanent: summary.permanent })
    }
    return NextResponse.json({ ok: true, ...summary })
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown'
    log.error('email_retry.failed', { reason })
    return NextResponse.json({ ok: false, error: reason }, { status: 500 })
  }
}

export const GET = withRequestLog('/api/cron/email-retry', handleGET)
