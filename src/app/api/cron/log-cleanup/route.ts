import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { bearerMatches } from '@/lib/security/constant-time'
import { createAdminClient } from '@/lib/supabase/admin'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * Rate-limit log cleanup (STEP 37), every six hours.
 *
 * Two tables grow with every guarded request and are only ever read for the
 * current window: `rate_limits` (per IP, `check_rate_limit`, two-hour
 * windows) and `user_rate_limits` (per user, `check_user_rate_limit`, a day).
 * The database ships the two sweeps that trim them, `cleanup_rate_limits()`
 * and `cleanup_user_rate_limits()`, SECURITY DEFINER and EXECUTE-granted to
 * the service role only; measured 2026-10-08, nothing called either one, so
 * both tables held every window since the limiter went live.
 *
 * WHAT THIS DOES NOT TOUCH, on purpose. `notification_outbox` rows carry the
 * unique `dedupe_key` that is the only thing stopping a second send; deleting
 * sent rows would re-open every one of them. `audit_log` is append-only and
 * ages its IPs through `retention`, monthly. `payment_webhook_events` and
 * `settlement_events` are the money journal. Each of those is a different
 * decision with a different owner, and none belongs in a six-hourly sweep.
 *
 * BOTH OR RED. The two calls are independent, so the first failing does not
 * skip the second, and the response names which one failed so a red run reads
 * as "user_rate_limits did not drain" rather than "cleanup broke".
 *
 * Auth: the scheduler sends Authorization: Bearer CRON_SECRET.
 */

async function handleGET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET
  if (!bearerMatches(request.headers.get('authorization'), secret ?? '')) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  const admin = createAdminClient()
  const failed: Record<string, string> = {}
  const swept: string[] = []

  // Two literal calls rather than a loop over names: the RPC-name gate
  // (lib/db/parameterized-queries.test.ts) accepts only literals, so a
  // reader can grep the function name straight to this line.
  const ip = await admin.rpc('cleanup_rate_limits')
  if (ip.error) {
    failed.cleanup_rate_limits = ip.error.message
    log.error('log_cleanup.sweep_failed', {
      sweep: 'cleanup_rate_limits',
      reason: ip.error.message,
    })
  } else {
    swept.push('cleanup_rate_limits')
  }

  const user = await admin.rpc('cleanup_user_rate_limits')
  if (user.error) {
    failed.cleanup_user_rate_limits = user.error.message
    log.error('log_cleanup.sweep_failed', {
      sweep: 'cleanup_user_rate_limits',
      reason: user.error.message,
    })
  } else {
    swept.push('cleanup_user_rate_limits')
  }

  if (Object.keys(failed).length > 0) {
    return NextResponse.json({ ok: false, swept, failed }, { status: 500 })
  }
  return NextResponse.json({ ok: true, swept })
}

export const GET = withRequestLog('/api/cron/log-cleanup', handleGET)
