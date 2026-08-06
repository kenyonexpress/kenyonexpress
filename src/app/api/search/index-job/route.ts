import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { runSearchIndexJob } from '@/lib/search/indexer'
import { searchIndexJobSchema } from '@/lib/search/pipeline-contracts'
import { verifyQstashSignature } from '@/lib/search/qstash'
import { bearerMatches } from '@/lib/security/constant-time'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * Queue worker: QStash delivers one search-index job per request.
 *
 * Auth: the `Upstash-Signature` JWS, or — for manual replays from the DLQ and
 * for ops — `Authorization: Bearer CRON_SECRET` (the cron-route convention).
 *
 * Response contract: 2xx acknowledges; any other status makes QStash retry
 * with exponential backoff up to QSTASH_RETRIES times, then fire the failure
 * callback (/api/search/index-dlq).
 */

function callerAuthorized(request: NextRequest, rawBody: string): boolean {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && bearerMatches(request.headers.get('authorization'), cronSecret)) {
    return true
  }
  const target = `${(process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')}/api/search/index-job`
  return verifyQstashSignature(request.headers.get('upstash-signature'), rawBody, target)
}

async function handlePOST(request: NextRequest): Promise<NextResponse> {
  const rawBody = await request.text()

  if (!callerAuthorized(request, rawBody)) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  let json: unknown
  try {
    json = JSON.parse(rawBody)
  } catch {
    // Malformed body will never parse on retry either — ack it dead.
    return NextResponse.json({ ok: true, dropped: 'invalid json' })
  }

  const parsed = searchIndexJobSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ ok: true, dropped: 'unrecognized job' })
  }

  try {
    const outcome = await runSearchIndexJob(parsed.data)
    return NextResponse.json({ ok: true, outcome })
  } catch (error) {
    log.error('search.index_job_failed', { err: error })
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 500 })
  }
}

export const POST = withRequestLog('/api/search/index-job', handlePOST)
