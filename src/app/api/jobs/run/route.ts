import { runJob } from '@/lib/jobs/runner'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { verifyQstashSignature } from '@/lib/search/qstash'
import { bearerMatches } from '@/lib/security/constant-time'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * The queue worker: QStash delivers one job envelope per request.
 *
 * Auth: the `Upstash-Signature` JWS over this exact URL and body, or, for a
 * human replaying a job by hand, `Authorization: Bearer CRON_SECRET`.
 *
 * Response contract: 2xx acknowledges. A DROPPED job (unparseable, unknown
 * type) is acknowledged too, because it will never parse on retry either;
 * the drop is logged by the runner. Any other outcome answers 500, which
 * makes QStash retry with backoff up to JOB_RETRIES times and then post the
 * failure to /api/jobs/dlq.
 */

function callerAuthorized(request: NextRequest, rawBody: string): boolean {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && bearerMatches(request.headers.get('authorization'), cronSecret)) return true
  const target = `${(process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')}/api/jobs/run`
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
    return NextResponse.json({ ok: true, dropped: 'invalid json' })
  }

  const result = await runJob(json)
  if (result.status === 'failed') {
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 })
  }
  if (result.status === 'dropped') {
    return NextResponse.json({ ok: true, dropped: result.reason })
  }
  return NextResponse.json({ ok: true, outcome: result.outcome })
}

export const POST = withRequestLog('/api/jobs/run', handlePOST)
