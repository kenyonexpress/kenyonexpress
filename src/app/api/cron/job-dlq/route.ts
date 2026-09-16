import { replayDeadJobs } from '@/lib/jobs/dlq'
import { publishJob } from '@/lib/jobs/queue'
import { runJobInline } from '@/lib/jobs/runner'
import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { bearerMatches } from '@/lib/security/constant-time'
import { createAdminClient } from '@/lib/supabase/admin'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * The drain for the job queue's dead letters.
 *
 * Every ten minutes: read the `dead` rows in `job_dlq` oldest first, re-queue
 * each one through the same transport it died on (QStash, or inline when
 * QStash is not configured), and stamp the row `replayed`. A job that has
 * already been replayed MAX_REPLAYS times is stamped `exhausted` and logged
 * at error level; it needs a person, and the row stays visible.
 *
 * Nothing here is unsafe to repeat: every handler in lib/jobs/runner.ts
 * re-reads its inputs from the database and is idempotent on the result
 * (an index upsert, an outbox claim, a GET).
 *
 * Auth: the scheduler sends Authorization: Bearer CRON_SECRET, same as the
 * other twenty-four.
 */
async function handleGET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET
  if (!bearerMatches(request.headers.get('authorization'), secret ?? '')) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  const results = await replayDeadJobs(createAdminClient() as never, (envelope) =>
    publishJob(envelope, runJobInline),
  )

  const counts = { replayed: 0, exhausted: 0, discarded: 0, failed: 0 }
  for (const result of results) counts[result.outcome]++

  if (results.length > 0) {
    // Journalled only when the sweep found something: an empty DLQ every ten
    // minutes is the normal state and not an event.
    log.info('jobs.dlq_sweep', { considered: results.length, ...counts })
  }

  return NextResponse.json({ ok: counts.failed === 0, considered: results.length, ...counts })
}

export const GET = withRequestLog('/api/cron/job-dlq', handleGET)
