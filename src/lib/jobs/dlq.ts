import { log } from '@/lib/observability/log'
import { type JobDlqInsert, type JobDlqRow, pendingJobDlqTable } from '@/lib/supabase/pending-jobs'
import type { Json } from '@/types/database'
import { type JobEnvelope, MAX_REPLAYS, jobEnvelopeSchema } from './contracts'

/**
 * The dead-letter queue: parking a job QStash gave up on, and replaying it.
 *
 * PARK EVERYTHING. The failure callback body wraps the original message with
 * the job base64-encoded in `sourceBody`. It is decoded when it can be and
 * stored verbatim either way, because a DLQ that drops what it cannot parse
 * is not a DLQ. `job_type` is lifted out for the operator's eyes.
 *
 * REPLAY IS BOUNDED. A replayed envelope carries `replayCount + 1` and
 * `replayOf` = the row it came from. If it dies again the callback parks a
 * NEW row with that count, and the replay cron refuses rows whose envelope
 * has already been replayed `MAX_REPLAYS` times, marking them `exhausted`
 * and logging at error level. Without the bound, a job that fails
 * deterministically would circulate between the queue and the DLQ forever.
 */

export type FailureCallback = {
  status?: number
  url?: string
  maxRetries?: number
  sourceBody?: string
  error?: string
}

/** The minimal client surface the DLQ needs; the admin client satisfies it and a test can fake it. */
export type DlqClient = {
  from(table: never): {
    insert(values: never): PromiseLike<{ error: { message: string } | null }>
    select(columns: string): {
      eq(
        column: string,
        value: string,
      ): {
        order(
          column: string,
          options: { ascending: boolean },
        ): {
          limit(n: number): PromiseLike<{ data: unknown; error: { message: string } | null }>
        }
      }
    }
    update(values: never): {
      eq(column: string, value: string): PromiseLike<{ error: { message: string } | null }>
    }
  }
}

export function decodeDeadJob(sourceBody: string | undefined): JobEnvelope | null {
  if (!sourceBody) return null
  try {
    const decoded = Buffer.from(sourceBody, 'base64').toString('utf8')
    const parsed = jobEnvelopeSchema.safeParse(JSON.parse(decoded))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/** Builds the row for one failure callback. Pure, so the shape is testable without a database. */
export function deadLetterRow(rawBody: string): JobDlqInsert {
  let callback: FailureCallback = {}
  let callbackJson: Json = { raw: rawBody }
  try {
    callbackJson = JSON.parse(rawBody) as Json
    callback = callbackJson as FailureCallback
  } catch {
    // Stored as raw text; an unparseable failure still gets a grave marker.
  }
  const job = decodeDeadJob(callback.sourceBody)
  return {
    job: job ? (job as unknown as Json) : null,
    job_type: job?.type ?? null,
    callback: callbackJson,
    last_error: callback.error ?? `worker responded ${callback.status ?? 'unknown'}`,
  }
}

export async function parkDeadJob(
  client: DlqClient,
  rawBody: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const row = deadLetterRow(rawBody)
  const { error } = await client.from(pendingJobDlqTable('job_dlq')).insert(row as never)
  if (error) {
    log.error('jobs.dlq_insert_failed', { reason: error.message })
    return { ok: false, error: error.message }
  }
  log.error('jobs.dead_lettered', { type: row.job_type, reason: row.last_error })
  return { ok: true }
}

export type ReplayResult = {
  id: string
  outcome: 'replayed' | 'exhausted' | 'discarded' | 'failed'
  detail: string
}

/** The envelope a replay publishes: the same job, one replay older, pointing at its grave. */
export function replayEnvelope(row: { id: string; job: unknown }): JobEnvelope | null {
  const parsed = jobEnvelopeSchema.safeParse(row.job)
  if (!parsed.success) return null
  return {
    ...parsed.data,
    id: crypto.randomUUID(),
    replayCount: parsed.data.replayCount + 1,
    replayOf: row.id,
  }
}

/**
 * Re-queue every `dead` row, oldest first, up to `limit`. The publish is
 * injected so the cron route can hand in the real transport and a test can
 * hand in a recorder.
 */
export async function replayDeadJobs(
  client: DlqClient,
  publish: (envelope: JobEnvelope) => Promise<unknown>,
  options: { limit?: number; now?: Date } = {},
): Promise<ReplayResult[]> {
  const limit = options.limit ?? 20
  const now = options.now ?? new Date()
  const { data, error } = await client
    .from(pendingJobDlqTable('job_dlq'))
    .select('id, job, job_type, status')
    .eq('status', 'dead')
    .order('created_at', { ascending: true })
    .limit(limit)
  if (error) {
    log.error('jobs.dlq_read_failed', { reason: error.message })
    return []
  }

  const rows = Array.isArray(data) ? (data as Pick<JobDlqRow, 'id' | 'job' | 'job_type'>[]) : []
  const results: ReplayResult[] = []

  for (const row of rows) {
    const envelope = replayEnvelope(row)
    if (!envelope) {
      await stamp(client, row.id, { status: 'discarded', resolved_at: now.toISOString() })
      results.push({ id: row.id, outcome: 'discarded', detail: 'envelope no longer parses' })
      continue
    }
    if (envelope.replayCount > MAX_REPLAYS) {
      await stamp(client, row.id, { status: 'exhausted', resolved_at: now.toISOString() })
      log.error('jobs.dlq_exhausted', { id: row.id, type: envelope.type, replays: MAX_REPLAYS })
      results.push({ id: row.id, outcome: 'exhausted', detail: `${MAX_REPLAYS} replays spent` })
      continue
    }
    try {
      await publish(envelope)
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause)
      log.error('jobs.dlq_replay_failed', { id: row.id, reason: detail })
      results.push({ id: row.id, outcome: 'failed', detail })
      continue
    }
    await stamp(client, row.id, { status: 'replayed', replayed_at: now.toISOString() })
    results.push({ id: row.id, outcome: 'replayed', detail: envelope.id })
  }
  return results
}

async function stamp(client: DlqClient, id: string, values: Partial<JobDlqRow>): Promise<void> {
  const { error } = await client
    .from(pendingJobDlqTable('job_dlq'))
    .update(values as never)
    .eq('id', id)
  if (error) log.error('jobs.dlq_stamp_failed', { id, reason: error.message })
}
