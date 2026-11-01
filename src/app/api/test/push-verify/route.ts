import { CacheControl, withCacheControl } from '@/lib/cache/http'
import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { sendWebPush } from '@/lib/push/web-push'
import { bearerMatches } from '@/lib/security/constant-time'
import { createAdminClient } from '@/lib/supabase/admin'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * C11 verification endpoint: test web push to one subscriber.
 *
 * Auth: requires CRON_SECRET to prevent abuse (anyone could trigger a push flood
 * without it). For local verification during development, set the bearer token.
 *
 * Usage:
 *   1. Subscribe via the browser using /api/push/subscribe
 *   2. Call this endpoint: curl -H "Authorization: Bearer <CRON_SECRET>" \
 *      https://kenyonexpress.co.il/api/test/push-verify
 *   3. Check browser for notification
 *
 * Returns: { ok: true, sent: number, failed: number, skipped: boolean }
 */
async function handleGET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET
  if (!bearerMatches(request.headers.get('authorization'), secret ?? '')) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()

  // Get one subscription for verification
  const { data: subscriptions, error } = await admin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth, user_id')
    .order('created_at', { ascending: false })
    .limit(1)

  if (error) {
    log.error('push-verify.subscription_read_failed', { reason: error.message })
    return NextResponse.json({ ok: false, error: 'subscription_read_failed' }, { status: 500 })
  }

  if (!subscriptions || subscriptions.length === 0) {
    return NextResponse.json(
      { ok: false, error: 'no_subscriptions', message: 'No push subscriptions found in database' },
      { status: 404 },
    )
  }

  const sub = subscriptions[0]
  if (!sub) {
    return NextResponse.json(
      { ok: false, error: 'no_subscriptions', message: 'No push subscriptions found in database' },
      { status: 404 },
    )
  }

  // Send a test notification
  const content = {
    title: 'KenyonExpress Test',
    body: 'Web Push verification - C11 complete',
    data: { url: '/', test: true },
  }

  const result = await sendWebPush(
    [{ endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth }],
    content,
    'test-c11-verification',
  )

  if (!result.ok) {
    return NextResponse.json({ ok: false, skipped: true, reason: result.reason }, { status: 500 })
  }

  // Clean up dead endpoints
  if (result.deadEndpoints.length > 0) {
    await admin.from('push_subscriptions').delete().in('endpoint', result.deadEndpoints)
  }

  return NextResponse.json({
    ok: true,
    sent: result.sent,
    failed: result.failed,
    deadEndpoints: result.deadEndpoints.length,
    user_id: sub.user_id,
    message: 'Test notification sent successfully',
  })
}

export const GET = withCacheControl(
  CacheControl.private,
  withRequestLog('/api/test/push-verify', handleGET),
)
