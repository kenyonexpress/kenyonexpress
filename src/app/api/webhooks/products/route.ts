import { createHmac, timingSafeEqual } from 'node:crypto'
import { revalidateCacheTags } from '@/lib/cache/revalidate'
import { cacheTagsForChange } from '@/lib/cache/tags'
import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { runSearchIndexJob } from '@/lib/search/indexer'
import { dbChangePayloadSchema, jobForChange } from '@/lib/search/pipeline-contracts'
import { enqueueSearchIndexJob } from '@/lib/search/qstash'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * Receiver for the Supabase Database Webhooks on `public.products` and
 * (STEP 08, 30.09) `public.categories`, INSERT / UPDATE / DELETE. Translates
 * the change into a search-index job and hands it to the queue. Never writes
 * anything itself. One route for both tables: the dashboard webhook on
 * `categories` points here with the same static header, and `jobForChange`
 * reads `payload.table` to decide which job shape to build.
 *
 * Auth, strongest available first:
 * 1. `x-search-signature`: hex HMAC-SHA256 of the raw body with
 *    SEARCH_WEBHOOK_SECRET — for senders that can sign.
 * 2. `x-webhook-secret`: the shared secret itself, compared in constant time —
 *    Supabase dashboard webhooks can only attach static headers (the same
 *    trust model as the Cardcom `?s=` secret).
 * Either way the payload is only a notification; the worker re-reads the row.
 *
 * STEP 36: the same notification is also the storefront's on-demand
 * revalidation. Before enqueueing, the change is mapped to the cache tags it
 * stales (`cacheTagsForChange`, lib/cache/tags.ts) and each is submitted with
 * `revalidateTag(tag, 'max')`: stale-while-revalidate, never blocking. This is
 * what makes a write that bypassed the admin actions (SQL, the till app, the
 * stock decrement after a sale) visible on the storefront within the request
 * that follows it, instead of within the hour. A stock-only UPDATE stales
 * exactly one product tag, which is the behaviour the contract in
 * catalogue-cache.ts wanted and could not have with a single tag. The list
 * is echoed in the response body so the Supabase webhook log shows it.
 */

function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length || bufA.length === 0) return false
  return timingSafeEqual(bufA, bufB)
}

function senderAuthorized(request: NextRequest, rawBody: string): boolean {
  const secret = process.env.SEARCH_WEBHOOK_SECRET
  if (!secret) return false

  const signature = request.headers.get('x-search-signature')
  if (signature) {
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
    return constantTimeEqual(signature, expected)
  }
  return constantTimeEqual(request.headers.get('x-webhook-secret') ?? '', secret)
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

  const parsed = dbChangePayloadSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'unrecognized payload' }, { status: 400 })
  }

  // Cache first, index second: the tag submission is synchronous and cannot
  // fail on transport, so a QStash outage below never leaves the storefront
  // serving a price the database no longer holds.
  const revalidated = revalidateCacheTags(cacheTagsForChange(parsed.data))
  if (revalidated.length > 0) {
    log.info('cache.revalidated', { source: 'db-webhook', tags: revalidated })
  }

  const job = jobForChange(parsed.data, new Date())
  if (!job) {
    // Not a products change we index — acknowledged, nothing queued.
    return NextResponse.json({ ok: true, queued: false, revalidated })
  }

  try {
    const outcome = await enqueueSearchIndexJob(job, runSearchIndexJob)
    return NextResponse.json({
      ok: true,
      queued: true,
      transport: outcome.transport,
      revalidated,
    })
  } catch (error) {
    // Non-2xx so Supabase's webhook retry (and our monitoring) sees the miss.
    log.error('search.webhook_enqueue_failed', { err: error })
    return NextResponse.json({ ok: false, error: 'enqueue failed' }, { status: 500 })
  }
}

export const POST = withRequestLog('/api/webhooks/products', handlePOST)
