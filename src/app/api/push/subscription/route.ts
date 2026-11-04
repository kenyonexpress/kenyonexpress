import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { vapidPublicKey } from '@/lib/push/vapid'
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { isSameOriginRequest } from '@/lib/security/same-origin'
import { authenticateRequest } from '@/lib/supabase/bearer'
import {
  deletePushSubscription,
  readPushTopics,
  upsertPushSubscription,
} from '@/server/push/subscription-write'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * The service worker's half of web push (S21).
 *
 * WHY A ROUTE AND NOT THE SERVER ACTION. A service worker cannot call a server
 * action: there is no React, no action id and no form protocol in a worker,
 * only fetch. The worker posts here in the two moments it has to re-subscribe
 * on its own (see PUSH SUBSCRIPTION UPKEEP in public/sw.js):
 * `pushsubscriptionchange`, and a VAPID key rotation found on activate.
 *
 * GET   the public key the server signs with NOW. Public by design (VAPID's
 *       public half is world-readable and already inlined in the bundle); the
 *       worker needs it because the inlined copy is whatever build it was
 *       installed from.
 * POST  `{ endpoint, keys, oldEndpoint? }`. Stores the new subscription for
 *       the signed-in caller and, when the old endpoint is the caller's,
 *       carries its topics over and deletes it. Same validation and the same
 *       service-role write as the action, through one module.
 *
 * Same-origin is required: the POST rides the session cookie, so a cross-site
 * page must not be able to plant an endpoint on a visitor's account.
 */

async function handleGET(): Promise<NextResponse> {
  const publicKey = vapidPublicKey()
  return NextResponse.json(
    { publicKey },
    { status: publicKey ? 200 : 404, headers: { 'cache-control': 'no-store' } },
  )
}

async function handlePOST(request: NextRequest): Promise<NextResponse> {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ ok: false, error: 'cross_site' }, { status: 403 })
  }

  const identity = await authenticateRequest(request)
  if (!identity) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

  const decision = await rateLimit('push-subscribe', identity.user.id)
  if (!decision.allowed) {
    return NextResponse.json(
      { ok: false, error: 'rate_limited' },
      { status: 429, headers: rateLimitHeaders(decision) },
    )
  }

  const body = (await request.json().catch(() => null)) as {
    endpoint?: unknown
    keys?: unknown
    oldEndpoint?: unknown
  } | null
  if (!body) return NextResponse.json({ ok: false, error: 'invalid_request' }, { status: 400 })

  const oldEndpoint =
    typeof body.oldEndpoint === 'string' &&
    body.oldEndpoint.startsWith('https://') &&
    body.oldEndpoint.length <= 2000 &&
    body.oldEndpoint !== body.endpoint
      ? body.oldEndpoint
      : null

  const topics = oldEndpoint ? await readPushTopics(identity.user.id, oldEndpoint) : null

  const saved = await upsertPushSubscription({
    userId: identity.user.id,
    input: { endpoint: body.endpoint, keys: body.keys },
    userAgent: request.headers.get('user-agent')?.slice(0, 256) ?? null,
    topics: topics ?? undefined,
  })
  if (!saved.ok) {
    if (saved.reason === 'invalid') {
      return NextResponse.json({ ok: false, error: 'invalid_subscription' }, { status: 400 })
    }
    if (saved.reason === 'unavailable') {
      return NextResponse.json({ ok: false, error: 'unavailable' }, { status: 503 })
    }
    log.warn('push.sw_subscribe_failed', { reason: saved.detail })
    return NextResponse.json({ ok: false, error: 'save_failed' }, { status: 500 })
  }

  // After the save, never before: a failed save must leave the old row, which
  // is at worst dead, rather than no row at all.
  if (oldEndpoint) {
    const removed = await deletePushSubscription(identity.user.id, oldEndpoint)
    if (!removed.ok && removed.reason === 'failed') {
      log.warn('push.sw_old_subscription_cleanup_failed', { reason: removed.detail })
    }
  }

  return NextResponse.json({ ok: true })
}

export const GET = withRequestLog('/api/push/subscription', handleGET)
export const POST = withRequestLog('/api/push/subscription', handlePOST)
