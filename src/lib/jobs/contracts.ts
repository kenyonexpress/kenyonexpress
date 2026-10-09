import { searchIndexJobSchema } from '@/lib/search/pipeline-contracts'
import { z } from 'zod'

/**
 * The job envelope and the closed set of job types the queue carries.
 *
 * ONE ENVELOPE FOR EVERY JOB. The search pipeline shipped its own queue
 * (`lib/search/qstash.ts` -> `/api/search/index-job`) with its own DLQ table
 * and no replay. A second background task would have meant a second worker
 * route, a second signature check, a second DLQ table and a second cron to
 * drain it. This module is the shape every job shares so the transport, the
 * worker, the dead-letter parking and the replay are written once.
 *
 * THE PAYLOAD IS VALIDATED PER TYPE, AT THE WORKER. QStash delivers bytes; a
 * job that fails its schema is acknowledged and dropped (it will never parse
 * on retry either), and the drop is logged with the type so a producer bug is
 * visible rather than retried five times into the DLQ.
 *
 * SMALL PAYLOADS, BY CONTRACT. A job names what to do and re-reads the rest
 * from the database at run time, the way `search-index` carries a product id
 * and not a product. That is what makes a replay from the DLQ a day later
 * converge on the truth instead of on a stale snapshot.
 */

export const JOB_TYPES = ['search-index', 'search-outbox-drain', 'cache-warm'] as const
export type JobType = (typeof JOB_TYPES)[number]

/** Warm a bounded list of same-site paths after a cache-wide invalidation. */
export const cacheWarmPayloadSchema = z.object({
  paths: z
    .array(z.string().regex(/^\/[^\s?#]*$/, 'a path, not a URL'))
    .min(1)
    .max(50),
})

export const JOB_PAYLOAD_SCHEMAS = {
  'search-index': searchIndexJobSchema,
  'search-outbox-drain': z.object({}).strict(),
  'cache-warm': cacheWarmPayloadSchema,
} as const satisfies Record<JobType, z.ZodTypeAny>

export type JobPayload<T extends JobType> = z.infer<(typeof JOB_PAYLOAD_SCHEMAS)[T]>

/**
 * The envelope. `v` is the wire version: a worker that sees a version it does
 * not know drops the job as unrecognized rather than guessing at the shape.
 * `replayCount` and `replayOf` are written by the DLQ replay, never by a
 * producer, and bound how many times a dead job is retried.
 */
export const jobEnvelopeSchema = z.object({
  v: z.literal(1),
  id: z.string().uuid(),
  type: z.enum(JOB_TYPES),
  payload: z.unknown(),
  enqueuedAt: z.string().datetime(),
  replayCount: z.number().int().min(0).default(0),
  replayOf: z.string().uuid().optional(),
})

export type JobEnvelope = z.infer<typeof jobEnvelopeSchema>

/** How many times the replay cron re-queues one dead job before giving up on it. */
export const MAX_REPLAYS = 3

export type ParsedJob = { [T in JobType]: { type: T; payload: JobPayload<T> } }[JobType]

/**
 * Envelope first, then the payload against its type's schema. Two steps so
 * the failure names which of the two was wrong.
 */
export function parseJob(
  input: unknown,
): { ok: true; envelope: JobEnvelope; job: ParsedJob } | { ok: false; reason: string } {
  const envelope = jobEnvelopeSchema.safeParse(input)
  if (!envelope.success) return { ok: false, reason: 'unrecognized envelope' }
  const schema = JOB_PAYLOAD_SCHEMAS[envelope.data.type]
  const payload = schema.safeParse(envelope.data.payload)
  if (!payload.success) return { ok: false, reason: `invalid payload for ${envelope.data.type}` }
  return {
    ok: true,
    envelope: envelope.data,
    job: { type: envelope.data.type, payload: payload.data } as ParsedJob,
  }
}

/** A fresh envelope for a producer. The id doubles as the QStash dedup key. */
export function newJobEnvelope<T extends JobType>(
  type: T,
  payload: JobPayload<T>,
  now: Date = new Date(),
): JobEnvelope {
  return {
    v: 1,
    id: crypto.randomUUID(),
    type,
    payload,
    enqueuedAt: now.toISOString(),
    replayCount: 0,
  }
}
