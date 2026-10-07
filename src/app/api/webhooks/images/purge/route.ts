import { createHmac } from 'node:crypto'
import { purgeImageCache } from '@/lib/images/purge'
import { keysFromBody } from '@/lib/images/purge-request'
import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { secretEquals } from '@/lib/security/constant-time'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * `POST /api/webhooks/images/purge`: evict one or more proxied images from
 * every cache that holds them (src/lib/images/purge.ts), the day a photo is
 * replaced under the same key, rather than 30 days later when the CDN
 * ceiling (src/lib/images/cache-policy.mjs) runs out.
 *
 * Two senders are expected and both are machines:
 *
 *   - The promotion script after a re-upload, or an operator with curl,
 *     posting `{ "keys": ["products/b7.avif"] }` or `{ "paths":
 *     ["/images/products/b7.avif"] }`. `{ "all": true }` invalidates the
 *     site-wide `images` tag.
 *   - A Supabase Database Webhook on `media_assets` (UPDATE / DELETE), whose
 *     payload carries the row; the keys are read off `record.url` and
 *     `old_record.url` when they point at the proxy. Any other table or a
 *     URL that is not a proxied image is acknowledged and nothing is purged.
 *
 * Auth, strongest available first, the same two shapes as the products
 * webhook: `x-image-purge-signature` (hex HMAC-SHA256 of the raw body with
 * IMAGE_PURGE_WEBHOOK_SECRET) for senders that can sign, else
 * `x-webhook-secret` holding the secret itself, compared in constant time
 * (secretEquals). An unset secret closes the route: 401 to everyone.
 *
 * Not rate limited: a shared-secret machine route with no session and no
 * cookie (rate-limit/route-coverage.test.ts lists it), and a purge is
 * idempotent, so a replay costs an API call and nothing else.
 */

function senderAuthorized(request: NextRequest, rawBody: string): boolean {
  const secret = process.env.IMAGE_PURGE_WEBHOOK_SECRET
  if (!secret) return false
  const signature = request.headers.get('x-image-purge-signature')
  if (signature) {
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
    return secretEquals(signature, expected)
  }
  return secretEquals(request.headers.get('x-webhook-secret'), secret)
}

async function handlePOST(request: NextRequest): Promise<NextResponse> {
  const rawBody = await request.text()
  if (!senderAuthorized(request, rawBody)) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  let json: unknown
  try {
    json = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 })
  }

  const parsed = keysFromBody(json)
  if (!parsed) {
    return NextResponse.json({ ok: false, error: 'unrecognized payload' }, { status: 400 })
  }
  if (!parsed.all && parsed.keys.length === 0) {
    return NextResponse.json({ ok: true, purged: false, keys: [], rejected: parsed.rejected })
  }

  const outcome = await purgeImageCache({ keys: parsed.keys, all: parsed.all })
  const failed = outcome.results.filter((r) => !r.ok)
  const configured = outcome.results.some((r) => r.status !== 'unconfigured')

  log.info('images.purge', {
    keys: parsed.keys.length,
    all: parsed.all,
    purged: outcome.purged,
    results: outcome.results.map((r) => `${r.backend}:${r.status}`).join(' '),
  })

  if (failed.length > 0) {
    // Non-2xx so the sender's retry sees the miss; the backends that
    // accepted are idempotent, so the replay costs nothing.
    return NextResponse.json(
      { ok: false, purged: outcome.purged, keys: parsed.keys, results: outcome.results },
      { status: 502 },
    )
  }

  return NextResponse.json(
    {
      ok: true,
      purged: outcome.purged,
      keys: parsed.keys,
      all: parsed.all,
      tags: outcome.tags,
      rejected: parsed.rejected,
      results: outcome.results,
      ...(configured ? {} : { reason: 'no purge backend configured' }),
    },
    { status: configured ? 200 : 202 },
  )
}

export const POST = withRequestLog('/api/webhooks/images/purge', handlePOST)
