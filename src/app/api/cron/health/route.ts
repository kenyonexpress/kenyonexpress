import { buildHealthAlert, runHealthChecks } from '@/lib/health/checks'
import { withJobRun } from '@/lib/observability/job-run'
import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { type SearchDrift, checkSearchDrift } from '@/lib/search/drift'
import { type DrainResult, drainSearchOutbox } from '@/lib/search/outbox-drain'
import { bearerMatches } from '@/lib/security/constant-time'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildCronFailureAlert, fetchCronRuns } from '@/server/queries/cron-runs'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * The scheduled health check, and the only thing on this system that pages a
 * human.
 *
 * WHY THE FULL REPORT LIVES BEHIND THE CRON SECRET AND NOT ON /api/health
 *
 * `/api/health` is unauthenticated by necessity - an uptime monitor cannot hold
 * a session - so everything it returns is public, and the useful shape of a
 * detailed health endpoint for an attacker is a free inventory of what you run
 * and what is currently broken. That route therefore stays coarse, and this one,
 * which names every dependency, requires the secret.
 *
 * WHAT IT SENDS AND WHAT IT DOES NOT
 *
 * Only a dependency that is DOWN produces a notification. A dependency that was
 * never configured does not: on this deployment several of them are waiting for
 * keys that are Ofir's, and a check that paged every five minutes about them
 * would be an alert nobody reads inside a day - which costs the alerts that
 * matter.
 *
 * The notification goes to ntfy, which needs no account and no API key, at the
 * topic this project already uses for its own progress. `HEALTH_NTFY_TOPIC`
 * overrides it. A failure to notify is logged and swallowed: the check itself
 * still answers, and a monitor that fails because its pager failed is a second
 * outage.
 */

const DEFAULT_TOPIC = 'kenyon-ofir-limit'

/**
 * Rows owed to the search index before the sweep says so out loud.
 *
 * Not zero: the queue is meant to be non-empty between a product edit and the
 * next five-minute sweep, and it is meant to hold a backlog for as long as
 * Meilisearch is unconfigured (`outbox-drain.ts` explains why those rows are
 * deliberately left). Production held 21 on 2026-09-09. The number worth waking
 * on is one that says the replay is no longer a replay.
 */
const OUTBOX_BACKLOG_WARN = 500

async function handleGET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET
  if (!bearerMatches(request.headers.get('authorization'), secret ?? '')) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  const report = await runHealthChecks()
  const alert = buildHealthAlert(report)

  // The search-index floor rides the same five-minute schedule (marathon
  // step 9): drain the outbox 132 built, then count DB against index. Both
  // are inert while Meilisearch is unconfigured, and neither may take the
  // health answer down with it -- a broken floor sweep is a log line and a
  // field in the response, not a 500 on the probe.
  // `pending: null` rather than 0 as the pre-run value: not measured is not the
  // same fact as nothing waiting, and if the try block below throws before the
  // drain returns, this is what ships in the response.
  let searchOutbox: DrainResult | { error: string } = {
    claimed: 0,
    done: 0,
    failed: 0,
    pending: null,
  }
  let searchDrift: SearchDrift = { status: 'skipped', reason: 'not attempted' }
  try {
    const admin = createAdminClient()
    searchOutbox = await drainSearchOutbox(admin)
    searchDrift = await checkSearchDrift(admin)
    if (searchDrift.status === 'drift') {
      log.warn('search.index_drift', {
        db_count: searchDrift.dbCount,
        index_count: searchDrift.indexCount,
        gap: searchDrift.gap,
      })
    }
    // Logged on its own, because the drift check above cannot see this. Drift
    // compares the index against the catalogue and SKIPS entirely while
    // Meilisearch is unconfigured, which is precisely when the backlog grows.
    if (searchOutbox.pending != null && searchOutbox.pending > OUTBOX_BACKLOG_WARN) {
      log.warn('search.outbox_backlog', {
        pending: searchOutbox.pending,
        drained: searchOutbox.done,
        configured: Boolean(process.env.MEILISEARCH_HOST),
      })
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown'
    searchOutbox = { error: reason }
    log.warn('search.floor_sweep_failed', { reason })
  }

  // The second alert this route can raise, and the only place two consecutive
  // failures of a scheduled job become audible. A job that fails once is
  // usually a GitHub run that was dropped; twice in a row is a fault, and
  // nothing else on this system is looking at that sequence. Inert (null)
  // while 228 is unapplied, which is why it cannot turn into noise before the
  // table exists.
  let cronAlert: string | null = null
  try {
    const view = await fetchCronRuns(0)
    if (!view.tableMissing) cronAlert = buildCronFailureAlert(view.health, view.failureThreshold)
    if (cronAlert) log.error('cron.repeated_failures', { detail: cronAlert })
  } catch (error) {
    log.warn('cron.health_read_failed', {
      reason: error instanceof Error ? error.message : 'unknown',
    })
  }

  if (alert || cronAlert) {
    if (alert) {
      log.error('health.degraded', {
        down: report.dependencies.filter((d) => d.status === 'down').map((d) => d.name),
      })
    }
    const topic = process.env.HEALTH_NTFY_TOPIC ?? DEFAULT_TOPIC
    try {
      await fetch(`https://ntfy.sh/${encodeURIComponent(topic)}`, {
        method: 'POST',
        body: [alert, cronAlert].filter(Boolean).join('\n'),
        headers: { Priority: 'high', Title: 'KenyonExpress health' },
        signal: AbortSignal.timeout(5000),
      })
    } catch (error) {
      log.warn('health.notify_failed', {
        reason: error instanceof Error ? error.message : 'unknown',
      })
    }
  }

  return NextResponse.json(
    { ...report, searchOutbox, searchDrift, cronAlert },
    {
      status: report.ok ? 200 : 503,
      headers: { 'cache-control': 'no-store' },
    },
  )
}

export const GET = withRequestLog('/api/cron/health', withJobRun('health', handleGET))
