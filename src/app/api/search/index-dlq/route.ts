import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { searchIndexJobSchema } from '@/lib/search/pipeline-contracts'
import { verifyQstashSignature } from '@/lib/search/qstash'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/types/database'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * QStash failure callback: fires once per message after every delivery retry
 * to /api/search/index-job has failed. Parks the dead job in
 * `search_index_dlq` so a human can see it and replay it (the worker accepts
 * `Authorization: Bearer CRON_SECRET` for exactly that).
 *
 * The callback body wraps the original message: the job itself arrives
 * base64-encoded in `sourceBody`. Everything is stored verbatim even when it
 * cannot be decoded — a DLQ that drops what it cannot parse is not a DLQ.
 */

type FailureCallback = {
  status?: number
  url?: string
  maxRetries?: number
  sourceBody?: string
  error?: string
}

function decodeJob(sourceBody: string | undefined): Json | null {
  if (!sourceBody) return null
  try {
    const decoded = Buffer.from(sourceBody, 'base64').toString('utf8')
    const parsed = searchIndexJobSchema.safeParse(JSON.parse(decoded))
    return parsed.success ? (parsed.data as unknown as Json) : null
  } catch {
    return null
  }
}

async function handlePOST(request: NextRequest): Promise<NextResponse> {
  const rawBody = await request.text()

  const target = `${(process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')}/api/search/index-dlq`
  if (!verifyQstashSignature(request.headers.get('upstash-signature'), rawBody, target)) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  let callback: FailureCallback = {}
  let callbackJson: Json = { raw: rawBody }
  try {
    callbackJson = JSON.parse(rawBody) as Json
    callback = callbackJson as FailureCallback
  } catch {
    // Store the raw text; unparseable failures still deserve a grave marker.
  }

  const admin = createAdminClient()
  const { error } = await admin.from('search_index_dlq').insert({
    job: decodeJob(callback.sourceBody),
    callback: callbackJson,
    last_error: callback.error ?? `worker responded ${callback.status ?? 'unknown'}`,
  })
  if (error) {
    log.error('search.dlq_insert_failed', { reason: error.message })
    // Non-2xx: QStash retries the callback; better twice than lost.
    return NextResponse.json({ ok: false }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

export const POST = withRequestLog('/api/search/index-dlq', handlePOST)
