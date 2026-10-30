import { GET as drainNotifications } from '@/app/api/cron/notifications/route'
import { CacheControl, withCacheControl } from '@/lib/cache/http'
import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { bearerMatches, cronSecretMatches } from '@/lib/security/constant-time'
import { createAdminClient } from '@/lib/supabase/admin'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * The expiry-reminder job pg_cron calls (C14, migration 311).
 *
 * Two steps, in this order: queue the T-7 and T-1 `voucher_expiring` notices
 * (idempotent: the outbox dedupe key is voucher + bucket, so a second run the
 * same day queues nothing), then drain the outbox through the existing
 * notifications route, which sends the browser and app push legs and the mail.
 * No delivery logic lives here, so the retry, backoff and dead-endpoint rules
 * stay in one place.
 *
 * Auth: CRON_SECRET, as `x-cron-secret` (pg_net) or a Bearer token.
 */
const BUCKETS = [7, 1]

async function handle(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET ?? ''
  const ok =
    bearerMatches(request.headers.get('authorization'), secret) ||
    cronSecretMatches(request.headers.get('x-cron-secret'), secret)
  if (!secret || !ok) return NextResponse.json({ ok: false }, { status: 401 })

  const { data: queued, error } = await createAdminClient().rpc(
    'enqueue_expiring_voucher_notices',
    {
      p_buckets: BUCKETS,
    },
  )
  if (error) {
    log.error('push.send_enqueue_failed', { reason: error.message })
    return NextResponse.json({ ok: false, error: 'enqueue_failed' }, { status: 500 })
  }

  const drained = await drainNotifications(request)
  const drain = (await drained.json().catch(() => null)) as Record<string, unknown> | null
  return NextResponse.json(
    { ok: drained.ok, queued: queued ?? 0, drain },
    { status: drained.status },
  )
}

export const GET = withCacheControl(CacheControl.private, withRequestLog('/api/push/send', handle))
export const POST = withRequestLog('/api/push/send', handle)
