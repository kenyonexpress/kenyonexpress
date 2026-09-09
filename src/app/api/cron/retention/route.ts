import { withJobRun } from '@/lib/observability/job-run'
import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { bearerMatches } from '@/lib/security/constant-time'
import { createAdminClient } from '@/lib/supabase/admin'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * Data retention sweep, monthly by schedule (see scripts/cron-jobs.json).
 *
 * Two jobs today. First: age audit_log IPs older than 365 days to NULL, through
 * fn_audit_retention_sweep() (pending/157) -- the ONLY write the append-only
 * trigger sanctions, and the function is EXECUTE-revoked from everyone but
 * the service role. WHO did WHAT stays forever; WHERE FROM ages out.
 *
 * Second: prune job_runs past 30 days (pending/228). Unbounded telemetry
 * becomes the outage it was meant to report -- seventeen jobs, three of them
 * every five minutes, is roughly five thousand rows a day.
 *
 * Until each migration is applied its RPC does not exist (PGRST202); that is
 * reported as ok:true with a null count so the scheduler stays green while the
 * migration waits on a human -- a red cron for a known pending file teaches
 * everyone to ignore red crons.
 *
 * Auth: the scheduler sends Authorization: Bearer CRON_SECRET.
 */
async function handleGET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET
  if (!bearerMatches(request.headers.get('authorization'), secret ?? '')) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('fn_audit_retention_sweep' as never)

  if (error) {
    if (error.code === 'PGRST202') {
      return NextResponse.json({ ok: true, swept: null, pending: '157_audit_ip_retention' })
    }
    log.error('retention.sweep_failed', { reason: error.message })
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  const swept = data as unknown as number
  if (swept > 0) log.info('retention.swept', { swept })

  return NextResponse.json({ ok: true, swept, jobRunsPruned: await pruneJobRuns() })
}

/**
 * Rows removed from job_runs, or null while 228 is unapplied.
 *
 * Never fails the sweep it rides on. Losing an audit-IP sweep because the
 * telemetry pruner is unhappy would be the tail wagging the dog, and the audit
 * sweep is the one with a legal obligation behind it.
 */
async function pruneJobRuns(): Promise<number | null> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin.rpc('prune_job_runs' as never)
    if (error) {
      if (error.code !== 'PGRST202')
        log.warn('retention.job_runs_prune_failed', { reason: error.message })
      return null
    }
    const pruned = data as unknown as number
    if (pruned > 0) log.info('retention.job_runs_pruned', { pruned })
    return pruned
  } catch (error) {
    log.warn('retention.job_runs_prune_failed', {
      reason: error instanceof Error ? error.message : 'unknown',
    })
    return null
  }
}

export const GET = withRequestLog('/api/cron/retention', withJobRun('retention', handleGET))
