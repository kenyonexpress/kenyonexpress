import { parkDeadJob } from '@/lib/jobs/dlq'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { verifyQstashSignature } from '@/lib/search/qstash'
import { createAdminClient } from '@/lib/supabase/admin'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * QStash failure callback for the job queue: fires once per message after
 * every delivery retry to /api/jobs/run has failed. Parks the job in
 * `job_dlq` (migration 242) so /api/cron/job-dlq can replay it and a human
 * can see it.
 *
 * Signed by Upstash and by nothing else, so the signature is the whole gate.
 * A failed insert answers 500 so QStash retries the callback: better a row
 * twice than a dead job lost.
 */
async function handlePOST(request: NextRequest): Promise<NextResponse> {
  const rawBody = await request.text()
  const target = `${(process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')}/api/jobs/dlq`
  if (!verifyQstashSignature(request.headers.get('upstash-signature'), rawBody, target)) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  const result = await parkDeadJob(createAdminClient() as never, rawBody)
  if (!result.ok) return NextResponse.json({ ok: false }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export const POST = withRequestLog('/api/jobs/dlq', handlePOST)
