import { withJobRun } from '@/lib/observability/job-run'
import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { bearerMatches } from '@/lib/security/constant-time'
import { anonymizeUserDataJob } from '@/server/account/anonymize-user-data'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * Anonymisation sweep for accounts past their deletion grace period, daily by
 * schedule (see scripts/cron-jobs.json).
 *
 * /api/account/delete records the request and dates it 30 days out; nothing is
 * destroyed at that moment, because a deletion a user regrets on day two has to
 * be recoverable. This is the job that makes it final, and it is the only
 * caller that does.
 *
 * Auth: the scheduler sends Authorization: Bearer CRON_SECRET. Compared with
 * bearerMatches() rather than !==, which stops at the first differing byte and
 * leaks the secret to a caller who can time the response.
 */
async function handleGET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET
  if (!bearerMatches(request.headers.get('authorization'), secret ?? '')) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  const result = await anonymizeUserDataJob()

  if (!result.success) {
    log.error('anonymize_user_data.failed', {
      anonymized: result.anonymized_count,
      errors: result.errors.length,
    })
    return NextResponse.json({ ok: false, errors: result.errors }, { status: 500 })
  }

  if (result.anonymized_count > 0) {
    log.info('anonymize_user_data.swept', { anonymized: result.anonymized_count })
  }

  return NextResponse.json({ ok: true, anonymized: result.anonymized_count })
}

export const GET = withRequestLog(
  '/api/cron/anonymize-user-data',
  withJobRun('anonymize-user-data', handleGET),
)
