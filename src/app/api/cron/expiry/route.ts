import { GET as drainOutbox } from '@/app/api/cron/notifications/route'
import { withJobRun } from '@/lib/observability/job-run'
import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { bearerMatches } from '@/lib/security/constant-time'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

/**
 * Coupon expiry reminders, one bucket per call: `?days=7` (T-7) or `?days=1`
 * (T-1). Scheduled by migrations/pending/258 as two pg_cron jobs, each a GET
 * with `Authorization: Bearer CRON_SECRET`. No `days` runs both buckets, which
 * is what the GitHub fallback in `scripts/cron-jobs.json` calls, since the
 * manifest carries a bare path.
 *
 * TWO STEPS, IN THIS ORDER.
 *
 *   1. `enqueue_expiring_voucher_notices([days])` writes one `voucher_expiring`
 *      outbox row per `issued` voucher whose Jerusalem expiry date is today +
 *      days. The dedupe key is `voucher_expiring:<voucher_id>:<bucket>` and
 *      the insert is ON CONFLICT DO NOTHING, so a second run on the same night,
 *      or the [7, 1] enqueue inside `/api/cron/expire-vouchers`, cannot remind
 *      twice. The outbox is the ledger.
 *   2. One pass of the outbox drain, so the reminder goes out now and not on
 *      whatever schedule the drain has. Measured 04.11.2026: `ke-notifications`
 *      POSTs to a GET-only route and every tick answers 405, so without this
 *      pass a reminder would be queued and never sent. The drain applies the
 *      customer's switches per leg: push default on, email only after the
 *      customer turned it on (`mayNotify`, S20), plus the in-app bell.
 *
 * A drain failure does not undo the enqueue. The rows are pending, and the next
 * drain that runs, here or anywhere, picks them up with its own backoff.
 */

const BUCKETS = [7, 1] as const

async function handleGET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET
  if (!bearerMatches(request.headers.get('authorization'), secret ?? '')) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  const raw = request.nextUrl.searchParams.get('days')
  const days = raw === null ? null : Number(raw)
  if (days !== null && !(BUCKETS as readonly number[]).includes(days)) {
    return NextResponse.json({ ok: false, error: 'days must be 7 or 1' }, { status: 400 })
  }
  const buckets = days === null ? [...BUCKETS] : [days]

  const admin = createAdminClient()
  const { data: enqueued, error } = await admin.rpc('enqueue_expiring_voucher_notices', {
    p_buckets: buckets,
  })
  if (error) {
    log.error('vouchers.expiry_enqueue_failed', { days, reason: error.message })
    return NextResponse.json({ ok: false, days, error: error.message }, { status: 500 })
  }

  // The drain checks the same bearer, so it is handed the caller's header and
  // nothing else.
  const drainRequest = new NextRequest(new URL('/api/cron/notifications', request.url), {
    headers: { authorization: request.headers.get('authorization') ?? '' },
  })
  let delivery: unknown = null
  try {
    const drained = await drainOutbox(drainRequest)
    delivery = await drained.json()
  } catch (drainError) {
    log.error('vouchers.expiry_drain_failed', {
      days,
      reason: drainError instanceof Error ? drainError.message : String(drainError),
    })
  }

  return NextResponse.json({ ok: true, days, enqueued: enqueued ?? 0, delivery })
}

export const GET = withRequestLog('/api/cron/expiry', withJobRun('expiry', handleGET))
