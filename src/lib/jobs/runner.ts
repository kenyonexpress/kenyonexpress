import { log } from '@/lib/observability/log'
import { isMeilisearchConfigured, runSearchIndexJob } from '@/lib/search/indexer'
import { createAdminClient } from '@/lib/supabase/admin'
import { drainSearchOutbox } from '@/server/search/outbox-drain'
import { type JobEnvelope, type JobPayload, type JobType, parseJob } from './contracts'
import { appUrl } from './queue'

/**
 * One handler per job type. The worker route and the inline fallback both
 * come through `runJob`, so a job behaves the same whether QStash delivered
 * it or the producer ran it in-process.
 *
 * A handler returns a short outcome string for the log and the DLQ, and
 * THROWS on failure: a throw is what makes the worker answer non-2xx, which
 * is what makes QStash retry. A handler that swallows its error is a job that
 * silently succeeds at doing nothing.
 */

export type JobHandler<T extends JobType> = (payload: JobPayload<T>) => Promise<string>

/** Warm each path with one GET and a short deadline. Best effort per path; a throw only when nothing warmed. */
async function cacheWarm(payload: JobPayload<'cache-warm'>): Promise<string> {
  const base = appUrl()
  const results = await Promise.all(
    payload.paths.map(async (path) => {
      try {
        const res = await fetch(`${base}${path}`, {
          method: 'GET',
          headers: { 'User-Agent': 'kenyonexpress-cache-warm/1', Accept: 'text/html' },
          signal: AbortSignal.timeout(8000),
          cache: 'no-store',
        })
        return res.ok
      } catch {
        return false
      }
    }),
  )
  const warmed = results.filter(Boolean).length
  if (warmed === 0) throw new Error(`cache-warm: 0 of ${payload.paths.length} paths answered`)
  return `warmed ${warmed}/${payload.paths.length}`
}

export const JOB_HANDLERS: { [T in JobType]: JobHandler<T> } = {
  'search-index': (payload) => runSearchIndexJob(payload),
  'search-outbox-drain': async () => {
    if (!isMeilisearchConfigured()) return 'skipped: meilisearch not configured'
    const summary = await drainSearchOutbox(createAdminClient(), runSearchIndexJob)
    if (summary.failed > 0) {
      throw new Error(`outbox drain: ${summary.failed} of ${summary.claimed} failed`)
    }
    return `drained ${summary.succeeded}/${summary.claimed}`
  },
  'cache-warm': cacheWarm,
}

export type RunOutcome =
  | { status: 'done'; outcome: string }
  | { status: 'dropped'; reason: string }
  | { status: 'failed'; error: string }

/**
 * Parse, dispatch, report. `dropped` is a job that will never run (bad
 * envelope, unknown type, invalid payload) and must be ACKNOWLEDGED by the
 * worker so QStash stops retrying it; `failed` is a job that should be tried
 * again.
 */
export async function runJob(input: unknown): Promise<RunOutcome> {
  const parsed = parseJob(input)
  if (!parsed.ok) {
    log.warn('jobs.dropped', { reason: parsed.reason })
    return { status: 'dropped', reason: parsed.reason }
  }
  const { envelope, job } = parsed
  try {
    const handler = JOB_HANDLERS[job.type] as (payload: unknown) => Promise<string>
    const outcome = await handler(job.payload)
    log.info('jobs.done', { type: job.type, id: envelope.id, outcome })
    return { status: 'done', outcome }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    log.error('jobs.failed', {
      type: job.type,
      id: envelope.id,
      replayCount: envelope.replayCount,
      reason: message,
    })
    return { status: 'failed', error: message }
  }
}

/** The inline shape `publishJob` expects: an outcome string, or a throw. */
export async function runJobInline(envelope: JobEnvelope): Promise<string> {
  const result = await runJob(envelope)
  if (result.status === 'failed') throw new Error(result.error)
  return result.status === 'done' ? result.outcome : `dropped: ${result.reason}`
}
