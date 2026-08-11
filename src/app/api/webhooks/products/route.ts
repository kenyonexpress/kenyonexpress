import { createHmac, timingSafeEqual } from 'node:crypto'
import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { runSearchIndexJob } from '@/lib/search/indexer'
import { dbChangePayloadSchema, jobForChange } from '@/lib/search/pipeline-contracts'
import { enqueueSearchIndexJob } from '@/lib/search/qstash'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * Receiver for the Supabase Database Webhook on `public.products`
 * (INSERT / UPDATE / DELETE). Translates the change into a search-index job
 * and hands it to the queue. Never writes anything itself.
 *
 * Auth, strongest available first:
 * 1. `x-search-signature`: hex HMAC-SHA256 of the raw body with
 *    SEARCH_WEBHOOK_SECRET — for senders that can sign.
 * 2. `x-webhook-secret`: the shared secret itself, compared in constant time —
 *    Supabase dashboard webhooks can only attach static headers (the same
 *    trust model as the Cardcom `?s=` secret).
 * Either way the payload is only a notification; the worker re-reads the row.
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

  const job = jobForChange(parsed.data, new Date())
  if (!job) {
    // Not a products change we index — acknowledged, nothing queued.
    return NextResponse.json({ ok: true, queued: false })
  }

  try {
    const outcome = await enqueueSearchIndexJob(job, runSearchIndexJob)
    return NextResponse.json({ ok: true, queued: true, transport: outcome.transport })
  } catch (error) {
    // Non-2xx so Supabase's webhook retry (and our monitoring) sees the miss.
    log.error('search.webhook_enqueue_failed', { err: error })
    return NextResponse.json({ ok: false, error: 'enqueue failed' }, { status: 500 })
  }
}

export const POST = withRequestLog('/api/webhooks/products', handlePOST)
