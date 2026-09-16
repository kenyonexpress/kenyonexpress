import { log } from '@/lib/observability/log'
import { type OffloadAccepted, type OffloadTask, offloadTaskSchema } from './task-contracts'
import { SIGNATURE_HEADER, signTask } from './task-signature'

/**
 * Handing side work to the Cloudflare Worker.
 *
 * WHAT MOVES OFF VERCEL. Fan-out that is wide and slow and has no result the
 * request needs: warming a hundred pages after the nightly catalogue
 * invalidation, posting one event to every subscribed receiver. On a
 * serverless function each of those holds the invocation open for the whole
 * fan-out and bills for it; in the Worker the request is one signed POST
 * that answers 202 in a few milliseconds, and a Cloudflare Queue does the
 * fan-out with its own retries and its own dead-letter queue
 * (`infra/cloudflare/workers/async-offload/wrangler.toml`).
 *
 * UNCONFIGURED MEANS INLINE. Neither `CF_ASYNC_WORKER_URL` nor
 * `CF_ASYNC_WORKER_SECRET` is set anywhere this repo can see. Without both,
 * the caller's `inline` fallback runs instead, so a producer never branches
 * on the environment and provisioning the Worker is a pure upgrade.
 *
 * NEVER A THROW OUT OF HERE. The Worker being down must not fail the cron
 * that asked it to warm a cache. A failed hand-off falls back to inline and
 * logs; a failed inline is reported in the outcome and logged.
 */

export type OffloadConfig = { url: string; secret: string }

export function offloadConfig(env: NodeJS.ProcessEnv = process.env): OffloadConfig | null {
  const url = env.CF_ASYNC_WORKER_URL?.trim().replace(/\/+$/, '')
  const secret = env.CF_ASYNC_WORKER_SECRET?.trim()
  if (!url || !secret || secret.length < 20 || !/^https:\/\//.test(url)) return null
  return { url, secret }
}

export function isOffloadConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return offloadConfig(env) !== null
}

export type OffloadOutcome =
  | { transport: 'worker'; accepted: OffloadAccepted }
  | { transport: 'inline'; outcome: string }
  | { transport: 'inline'; failed: string }

export type OffloadOptions = {
  /** What to do when the Worker is not configured or does not accept the task. */
  inline: (task: OffloadTask) => Promise<string>
  env?: NodeJS.ProcessEnv
  fetchImpl?: typeof fetch
  nowMs?: number
}

export async function offloadTask(
  task: OffloadTask,
  options: OffloadOptions,
): Promise<OffloadOutcome> {
  const parsed = offloadTaskSchema.safeParse(task)
  if (!parsed.success) {
    // A producer bug, not a runtime state. Logged, and not sent anywhere.
    log.error('offload.invalid_task', { type: (task as { type?: string }).type ?? 'unknown' })
    return { transport: 'inline', failed: 'invalid task' }
  }

  const config = offloadConfig(options.env ?? process.env)
  if (config) {
    const body = JSON.stringify(parsed.data)
    try {
      const doFetch = options.fetchImpl ?? fetch
      const res = await doFetch(`${config.url}/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [SIGNATURE_HEADER]: await signTask(config.secret, body, options.nowMs),
        },
        body,
        signal: AbortSignal.timeout(5000),
        cache: 'no-store',
      })
      if (res.status === 202) {
        const accepted = (await res.json()) as OffloadAccepted
        return { transport: 'worker', accepted }
      }
      log.warn('offload.worker_refused', { status: res.status, type: parsed.data.type })
    } catch (error) {
      log.warn('offload.worker_unreachable', {
        type: parsed.data.type,
        reason: error instanceof Error ? error.message : String(error),
      })
    }
  }

  try {
    return { transport: 'inline', outcome: await options.inline(parsed.data) }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    log.error('offload.inline_failed', { type: parsed.data.type, reason })
    return { transport: 'inline', failed: reason }
  }
}
