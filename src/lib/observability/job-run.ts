import { log } from '@/lib/observability/log'
import { bearerMatches } from '@/lib/security/constant-time'
import { createAdminClient } from '@/lib/supabase/admin'
import type { NextRequest } from 'next/server'

/**
 * Records one row per scheduled-job execution into `job_runs`.
 *
 * WHAT THIS IS FOR. `scripts/run-cron-jobs.sh` records the CALL: a 2xx is
 * success and anything else is red. That cannot tell a job that drained a
 * backlog from one that returned 200 having done nothing because a dependency
 * was never configured, it cannot survive the expiry of an Actions log, and it
 * cannot see a run that was killed mid-flight. `migrations/pending/228_job_runs.sql`
 * is the other half of this file and explains all three.
 *
 * THE RULE THIS MODULE OBEYS ABOVE EVERY OTHER. **Telemetry may not break the
 * job it is watching.** Every database call here is wrapped, every failure is
 * logged once and swallowed, and an absent table (the normal state until 228 is
 * approved) degrades to doing nothing at all. This is not defensive
 * decoration: this repository has already shipped a cron route that called a
 * function signature production did not have and returned 500 on every run for
 * weeks, so the failure mode is measured, not imagined.
 *
 * WHAT IS DELIBERATELY NOT RECORDED. An unauthenticated request. Every cron
 * route is a public URL that answers 401 without the bearer, so recording those
 * would let anyone on the internet fill the table, and the rows would say
 * nothing about whether the job ran. The wrapper checks the bearer only to
 * decide whether an invocation is worth a row; it never gates, never changes a
 * status code, and the route's own guard remains the only thing that decides
 * who gets in.
 */

/** Handle threaded from start to finish. A null id means "not being recorded". */
export type JobRunHandle = {
  id: string | null
  startedAtMs: number
}

/** Terminal states. `running` is written by the insert and never by the caller. */
export type JobRunStatus = 'ok' | 'failed'

/**
 * Response bodies are job-authored JSON of unknown shape. Only top-level
 * scalars are kept: they are where the counts live (`processed`, `sent`,
 * `skipped`), and a nested object is how a job accidentally writes a customer
 * row into an operational table nobody thought was personal data.
 */
export function summariseBody(body: unknown, maxKeys = 24): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return {}
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (Object.keys(out).length >= maxKeys) break
    const t = typeof value
    if (t === 'number' || t === 'boolean') {
      out[key] = value
    } else if (t === 'string') {
      out[key] = (value as string).slice(0, 200)
    }
    // objects, arrays, null and undefined are dropped on purpose
  }
  return out
}

/** True when this invocation carries the cron secret, i.e. is worth a row. */
function isScheduledCall(request: NextRequest): boolean {
  return bearerMatches(request.headers.get('authorization'), process.env.CRON_SECRET ?? '')
}

/**
 * Opens a `running` row. Returns a null id on any failure, including the table
 * not existing, which is the state until 228 is approved.
 */
export async function startJobRun(jobName: string): Promise<JobRunHandle> {
  const startedAtMs = performance.now()
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('job_runs' as never)
      .insert({ job_name: jobName, status: 'running' } as never)
      .select('id')
      .single()

    if (error) {
      log.debug('job_run.start_skipped', { job: jobName, reason: error.code ?? error.message })
      return { id: null, startedAtMs }
    }
    return { id: (data as { id: string } | null)?.id ?? null, startedAtMs }
  } catch (error) {
    log.debug('job_run.start_skipped', {
      job: jobName,
      reason: error instanceof Error ? error.message : 'unknown',
    })
    return { id: null, startedAtMs }
  }
}

/** Closes the row opened by `startJobRun`. A null id is a no-op. */
export async function finishJobRun(
  handle: JobRunHandle,
  outcome: { status: JobRunStatus; httpStatus?: number; detail?: Record<string, unknown> },
): Promise<void> {
  if (!handle.id) return
  const durationMs = Math.max(0, Math.round(performance.now() - handle.startedAtMs))
  try {
    const admin = createAdminClient()
    const { error } = await admin
      .from('job_runs' as never)
      .update({
        status: outcome.status,
        http_status: outcome.httpStatus ?? null,
        duration_ms: durationMs,
        finished_at: new Date().toISOString(),
        detail: outcome.detail ?? {},
      } as never)
      .eq('id', handle.id)

    if (error) {
      // The row stays `running`, which job_runs_health() reads as a failure
      // once it goes stale. Losing the close is louder than losing the row.
      log.warn('job_run.finish_failed', { reason: error.code ?? error.message })
    }
  } catch (error) {
    log.warn('job_run.finish_failed', {
      reason: error instanceof Error ? error.message : 'unknown',
    })
  }
}

/**
 * Wraps a cron route handler so the execution is recorded.
 *
 * Composes inside `withRequestLog`, which stays outermost because a request id
 * has to exist before anything logs:
 *
 *     export const GET = withRequestLog('/api/cron/x', withJobRun('x', handleGET))
 *
 * The handler's behaviour is untouched. Its response is returned as it came
 * back, and a throw is recorded as a failure and re-thrown so
 * `instrumentation.ts` still sees it.
 */
export function withJobRun<Args extends unknown[]>(
  jobName: string,
  handler: (request: NextRequest, ...args: Args) => Response | Promise<Response>,
): (request: NextRequest, ...args: Args) => Promise<Response> {
  return async (request: NextRequest, ...args: Args): Promise<Response> => {
    if (!isScheduledCall(request)) return handler(request, ...args)

    const handle = await startJobRun(jobName)
    try {
      const response = await handler(request, ...args)
      await finishJobRun(handle, {
        // A cron job answering 4xx or 5xx did not do its work, whatever it says
        // in the body. 503 from /api/cron/health is the designed shape of "a
        // dependency is down", and that is a failed run.
        status: response.status < 400 ? 'ok' : 'failed',
        httpStatus: response.status,
        detail: await readSummary(response),
      })
      return response
    } catch (error) {
      await finishJobRun(handle, {
        status: 'failed',
        detail: { error: error instanceof Error ? error.message.slice(0, 200) : 'unknown' },
      })
      throw error
    }
  }
}

/**
 * The counts a job reported, or `{}`. Reads a CLONE: consuming the response the
 * caller is about to return would turn a recorded run into a broken one.
 */
async function readSummary(response: Response): Promise<Record<string, unknown>> {
  const type = response.headers.get('content-type') ?? ''
  if (!type.includes('json')) return {}
  try {
    return summariseBody(await response.clone().json())
  } catch {
    return {}
  }
}
