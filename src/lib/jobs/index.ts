import { type JobPayload, type JobType, newJobEnvelope } from './contracts'
import { type PublishOptions, type PublishOutcome, publishJob } from './queue'
import { runJobInline } from './runner'

/**
 * The producer API: name a job type, hand over its payload, and let the
 * transport decide between QStash and inline.
 *
 *   await enqueueJob('cache-warm', { paths: ['/', '/products'] })
 *
 * Everything else (envelope, dedup id, retries, failure callback, the inline
 * fallback) is the queue's business, not the caller's.
 */
export async function enqueueJob<T extends JobType>(
  type: T,
  payload: JobPayload<T>,
  options: PublishOptions = {},
): Promise<PublishOutcome> {
  return publishJob(newJobEnvelope(type, payload), runJobInline, options)
}

export { JOB_TYPES, MAX_REPLAYS, parseJob, newJobEnvelope } from './contracts'
export type { JobEnvelope, JobPayload, JobType } from './contracts'
export { isQstashConfigured, JOB_RETRIES, JOBS_DLQ_PATH, JOBS_RUN_PATH } from './queue'
export { runJob, runJobInline } from './runner'
