import type { JobEnvelope } from './contracts'

/**
 * The QStash transport for job envelopes.
 *
 * SDK-free for the same reasons `lib/search/qstash.ts` and
 * `lib/rate-limit/upstash.ts` are: one publish call is not worth a
 * dependency, and this worktree's `node_modules` is shared. That file's
 * `verifyQstashSignature` is reused unchanged by the worker route; only the
 * publish side is restated here because the target and the callback differ.
 *
 * Delivery contract:
 *   publish -> QStash -> POST {APP_URL}/api/jobs/run
 *   non-2xx -> QStash retries with exponential backoff up to JOB_RETRIES
 *   still failing -> POST {APP_URL}/api/jobs/dlq (failure callback), and the
 *                    message parks in Upstash's own DLQ as a second copy.
 *
 * Unconfigured (no QSTASH_TOKEN: tests, previews, a laptop) the job runs
 * INLINE through the injected runner, so the pipeline works end to end without
 * Upstash and a producer never has to branch on the environment.
 */

const QSTASH_URL = 'https://qstash.upstash.io'
export const JOB_RETRIES = 5
export const JOBS_RUN_PATH = '/api/jobs/run'
export const JOBS_DLQ_PATH = '/api/jobs/dlq'

export type PublishOutcome =
  | { transport: 'qstash'; messageId: string }
  | { transport: 'inline'; outcome: string }

export type PublishOptions = {
  /** Seconds QStash holds the message before the first delivery. */
  delaySeconds?: number
  env?: NodeJS.ProcessEnv
  fetchImpl?: typeof fetch
}

export function appUrl(env: NodeJS.ProcessEnv = process.env): string {
  const url = env.NEXT_PUBLIC_APP_URL
  if (!url) throw new Error('Missing required env: NEXT_PUBLIC_APP_URL')
  return url.replace(/\/$/, '')
}

export function isQstashConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.QSTASH_TOKEN)
}

export async function publishJob(
  envelope: JobEnvelope,
  runInline: (envelope: JobEnvelope) => Promise<string>,
  options: PublishOptions = {},
): Promise<PublishOutcome> {
  const env = options.env ?? process.env
  const token = env.QSTASH_TOKEN
  if (!token) return { transport: 'inline', outcome: await runInline(envelope) }

  const base = appUrl(env)
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Upstash-Retries': String(JOB_RETRIES),
    'Upstash-Failure-Callback': `${base}${JOBS_DLQ_PATH}`,
    // The envelope id: a producer that publishes the same envelope twice (a
    // retried server action, a replayed webhook) collapses to one delivery.
    'Upstash-Deduplication-Id': envelope.id,
  }
  if (options.delaySeconds && options.delaySeconds > 0) {
    headers['Upstash-Delay'] = `${Math.ceil(options.delaySeconds)}s`
  }

  const doFetch = options.fetchImpl ?? fetch
  const res = await doFetch(`${QSTASH_URL}/v2/publish/${base}${JOBS_RUN_PATH}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(envelope),
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`qstash publish failed: ${res.status} ${await res.text()}`)
  }
  const data = (await res.json()) as { messageId?: string }
  return { transport: 'qstash', messageId: data.messageId ?? 'unknown' }
}
