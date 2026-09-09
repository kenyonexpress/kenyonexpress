import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import manifest from '../../../scripts/cron-jobs.json'

/**
 * What the admin cron screen reads.
 *
 * THE DISTINCTION THIS MODULE EXISTS TO PRESERVE. There are three ways a job
 * can have no rows, and a dashboard that renders them the same way is worse
 * than no dashboard:
 *
 *   1. `migrations/pending/228_job_runs.sql` is not applied, so NOTHING is
 *      recorded. Every job looks like it never ran.
 *   2. The table exists and this job has never been called.
 *   3. The table exists, the job runs, and the rows were pruned.
 *
 * (1) is the current state of production and it is the one that would be read
 * as (2) by a screen that just counted rows. `tableMissing` carries it out of
 * here so the page can say so in words instead of drawing seventeen empty rows
 * that mean nothing.
 */

export type JobStatus = 'running' | 'ok' | 'failed'

export type JobHealth = {
  jobName: string
  /** The schedule from the manifest, or null for a row with no manifest entry. */
  cron: string | null
  lastStartedAt: string | null
  lastStatus: JobStatus | null
  lastDurationMs: number | null
  consecutiveFailures: number
}

export type JobRun = {
  id: string
  jobName: string
  startedAt: string
  finishedAt: string | null
  durationMs: number | null
  status: JobStatus
  httpStatus: number | null
  detail: Record<string, unknown>
}

export type CronRunsView = {
  /** True while 228 is unapplied. Everything else below is then empty by cause. */
  tableMissing: boolean
  health: JobHealth[]
  recent: JobRun[]
  /** Alert threshold, matching the one docs/CRON.md documents. */
  failureThreshold: number
}

/** Two, per the goal. A single failure is usually a dropped GitHub run. */
export const FAILURE_THRESHOLD = 2

/** Job name -> cron expression, from the one file that is the source of truth. */
const SCHEDULE: Record<string, string> = Object.fromEntries(
  manifest.jobs.map((job) => [job.name, job.cron]),
)

/** Every job the scheduler is supposed to call, in manifest order. */
export const SCHEDULED_JOB_NAMES: string[] = manifest.jobs.map((job) => job.name)

/** PostgREST codes that mean "the table is not there", not "the query failed". */
function isMissingRelation(code: string | null | undefined): boolean {
  // PGRST205: not found in the schema cache. PGRST202: RPC not found.
  // 42P01/42883: the same two answers from Postgres itself.
  return code === 'PGRST205' || code === 'PGRST202' || code === '42P01' || code === '42883'
}

type HealthRow = {
  job_name: string
  last_started_at: string | null
  last_status: JobStatus | null
  last_duration_ms: number | null
  consecutive_failures: number | null
}

type RunRow = {
  id: string
  job_name: string
  started_at: string
  finished_at: string | null
  duration_ms: number | null
  status: JobStatus
  http_status: number | null
  detail: Record<string, unknown> | null
}

/**
 * Health plus the recent runs, in one read each.
 *
 * A job with no rows still appears, with `lastStatus: null`. "Scheduled and
 * never once observed running" is the most alarming state on this screen and
 * the one a query driven by the table alone cannot show, because there is
 * nothing to drive it.
 */
export async function fetchCronRuns(recentLimit = 50): Promise<CronRunsView> {
  const admin = createAdminClient()

  const healthResult = await admin.rpc('job_runs_health' as never)
  if (healthResult.error && isMissingRelation(healthResult.error.code)) {
    return {
      tableMissing: true,
      health: SCHEDULED_JOB_NAMES.map(emptyHealth),
      recent: [],
      failureThreshold: FAILURE_THRESHOLD,
    }
  }

  const byName = new Map<string, HealthRow>()
  for (const row of (healthResult.data as HealthRow[] | null) ?? []) {
    byName.set(row.job_name, row)
  }

  // `recentLimit: 0` is the health route asking only "is anything failing
  // repeatedly", every five minutes. Skipping the query outright rather than
  // asking for zero rows keeps that path to one round trip.
  const recentRows =
    recentLimit > 0
      ? (((
          await admin
            .from('job_runs' as never)
            .select(
              'id, job_name, started_at, finished_at, duration_ms, status, http_status, detail',
            )
            .order('started_at', { ascending: false })
            .limit(recentLimit)
        ).data as RunRow[] | null) ?? [])
      : []

  const recent = recentRows.map(
    (row): JobRun => ({
      id: row.id,
      jobName: row.job_name,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      durationMs: row.duration_ms,
      status: row.status,
      httpStatus: row.http_status,
      detail: row.detail ?? {},
    }),
  )

  // Manifest order first, then anything recorded under a name the manifest no
  // longer has. A renamed job leaving its history behind is worth seeing.
  const extra = [...byName.keys()].filter((name) => !SCHEDULE[name]).sort()

  return {
    tableMissing: false,
    health: [...SCHEDULED_JOB_NAMES, ...extra].map((name) => {
      const row = byName.get(name)
      if (!row) return emptyHealth(name)
      return {
        jobName: name,
        cron: SCHEDULE[name] ?? null,
        lastStartedAt: row.last_started_at,
        lastStatus: row.last_status,
        lastDurationMs: row.last_duration_ms,
        consecutiveFailures: row.consecutive_failures ?? 0,
      }
    }),
    recent,
    failureThreshold: FAILURE_THRESHOLD,
  }
}

function emptyHealth(jobName: string): JobHealth {
  return {
    jobName,
    cron: SCHEDULE[jobName] ?? null,
    lastStartedAt: null,
    lastStatus: null,
    lastDurationMs: null,
    consecutiveFailures: 0,
  }
}

/**
 * The jobs that have failed at least `threshold` times in a row.
 *
 * A job with no rows is NOT here. It has not failed twice, it has produced no
 * evidence at all, and folding the two together would make the alert fire for
 * all seventeen the moment the table appears.
 */
export function jobsFailingRepeatedly(
  health: JobHealth[],
  threshold = FAILURE_THRESHOLD,
): JobHealth[] {
  return health.filter((job) => job.lastStatus !== null && job.consecutiveFailures >= threshold)
}

/**
 * The line ntfy carries when jobs are failing repeatedly, or null.
 *
 * Null and not an empty string: an alerter that posts "0 jobs failing" every
 * five minutes is an alerter nobody reads by the end of the week, and the
 * alerts that matter go with it.
 */
export function buildCronFailureAlert(
  health: JobHealth[],
  threshold = FAILURE_THRESHOLD,
): string | null {
  const failing = jobsFailingRepeatedly(health, threshold)
  if (failing.length === 0) return null
  const parts = failing
    .slice()
    .sort((a, b) => b.consecutiveFailures - a.consecutiveFailures)
    .map((job) => `${job.jobName} x${job.consecutiveFailures}`)
  return `Scheduled jobs failing ${threshold}+ times in a row: ${parts.join(', ')}`
}
