import { buildHealthAlert, runHealthChecks } from '@/lib/health/checks'
import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { type SearchDrift, checkSearchDrift } from '@/lib/search/drift'
import { type DrainResult, drainSearchOutbox } from '@/lib/search/outbox-drain'
import { bearerMatches } from '@/lib/security/constant-time'
import { createAdminClient } from '@/lib/supabase/admin'
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
  let searchOutbox: DrainResult | { error: string } = { claimed: 0, done: 0, failed: 0 }
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
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown'
    searchOutbox = { error: reason }
    log.warn('search.floor_sweep_failed', { reason })
  }

  if (alert) {
    log.error('health.degraded', {
      down: report.dependencies.filter((d) => d.status === 'down').map((d) => d.name),
    })
    const topic = process.env.HEALTH_NTFY_TOPIC ?? DEFAULT_TOPIC
    try {
      await fetch(`https://ntfy.sh/${encodeURIComponent(topic)}`, {
        method: 'POST',
        body: alert,
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
    { ...report, searchOutbox, searchDrift },
    {
      status: report.ok ? 200 : 503,
      headers: { 'cache-control': 'no-store' },
    },
  )
}

export const GET = withRequestLog('/api/cron/health', handleGET)
