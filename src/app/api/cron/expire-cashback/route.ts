import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { bearerMatches } from '@/lib/security/constant-time'
import { createAdminClient } from '@/lib/supabase/admin'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * Nightly cashback expiry sweep: unspent cashback lapses 12 months after it
 * was earned.
 *
 * ONE RPC AND NO DECISIONS HERE. `fn_cashback_expire` (migration 215) owns the
 * whole rule: per user, under the same advisory lock the bonus award takes, it
 * reads what the reserve credited more than 12 months ago against every debit
 * the wallet ever made, caps the difference at the live balance, transfers it
 * back to `platform:cashback_reserve` and writes the negative `expiry` row in
 * `cashback_ledger` — everything keyed per user and UTC day, so a rerun moves
 * nothing twice. It caps itself at 200 users per call and a backlog drains
 * over consecutive nights; passing a limit from here would put that cap in
 * two places (the expire-vouchers route made the same call).
 *
 * A failed run answers 500 and the next night's sweep recomputes from scratch:
 * the money legs are idempotent in the database, so retrying is always safe
 * and never urgent. Per-user failures inside the function do not fail the run
 * — they come back in `errors` and are logged loudly instead, because one
 * broken wallet must not hide every other user's sweep behind a retry loop.
 *
 * Auth: the scheduler sends Authorization: Bearer CRON_SECRET.
 */
async function handleGET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET
  if (!bearerMatches(request.headers.get('authorization'), secret ?? '')) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  const admin = createAdminClient()

  const { data, error } = await admin.rpc('fn_cashback_expire' as never)
  if (error) {
    log.error('cashback.expiry_sweep_failed', { reason: error.message })
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  const result = (data ?? {}) as { swept?: number; amount_agorot?: number; errors?: number }
  const swept = result.swept ?? 0
  const amountAgorot = result.amount_agorot ?? 0
  const errors = result.errors ?? 0

  if (errors > 0) {
    // The run committed for everyone it could; these users are retried
    // tomorrow by construction. Loud, because a persistent per-user failure
    // has no other symptom anywhere.
    log.error('cashback.expiry_sweep_partial', { swept, amountAgorot, errors })
  } else if (swept > 0) {
    log.info('cashback.expiry_swept', { swept, amountAgorot })
  }

  return NextResponse.json({ ok: true, swept, amountAgorot, errors })
}

export const GET = withRequestLog('/api/cron/expire-cashback', handleGET)
