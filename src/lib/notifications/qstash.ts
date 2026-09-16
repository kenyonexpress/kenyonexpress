import { log } from '@/lib/observability/log'
import { verifyQstashSignature } from '@/lib/search/qstash'

/**
 * Upstash QStash as the WAKE and RETRY transport over `notification_outbox`.
 *
 * THE OUTBOX IS THE TRUTH, QSTASH IS THE CLOCK. docs/ARCHITECTURE-NOTIFICATIONS.md
 * §4 draws the line: the Postgres row says WHAT must go out, dedupes it and
 * is the audit; QStash only decides WHEN the drain runs. Without QStash the
 * cron sweeps every five minutes and everything still arrives. With it, a
 * paid order wakes the drain within a second of the enqueue, a failed leg is
 * retried at exactly its backoff instant instead of at the next sweep that
 * happens to fall after it, and a worker that keeps answering 5xx lands in a
 * dead-letter route a person can read.
 *
 * SDK-FREE, LIKE `src/lib/search/qstash.ts`, and for the same reasons: one
 * POST and one JWT verification, and this worktree's node_modules is shared.
 * The verification is IMPORTED from the search module rather than copied, so
 * a signing-key rotation fix lands in one place.
 *
 * NEVER THROWS. Every caller sits after the event already happened (the row
 * is in the outbox, the card was charged). An unreachable QStash must not
 * fail that flow; the cron sweep is the floor under this and it runs anyway.
 *
 * DEGRADES TO NOTHING WITHOUT `QSTASH_TOKEN`. Local development, CI and the
 * deploy that predates the Upstash project all run this code with no token
 * and report `{ transport: 'none' }`. That is not a failure of the message.
 */

export const NOTIFICATIONS_WORKER_PATH = '/api/cron/notifications'
export const NOTIFICATIONS_DLQ_PATH = '/api/webhooks/notifications-dlq'

/** QStash's own retries of a non-2xx worker answer, with its exponential backoff. */
export const QSTASH_RETRIES = 5

/**
 * The reasons a wake is published. Carried in the body so the worker's log
 * line and the DLQ entry say what the message was FOR.
 */
export type WakeReason = 'enqueue' | 'retry' | 'manual'

export interface WakeMessage {
  reason: WakeReason
  /** Drain this one row when set; a full sweep otherwise. */
  outbox_id?: string
  /** The outbox row's dedupe key, which is also the QStash deduplication id. */
  dedupe_key?: string
  /** For a retry wake: the attempt number the drain is retrying after. */
  attempt?: number
}

export type WakeOutcome =
  | { transport: 'qstash'; messageId: string }
  | { transport: 'none'; reason: string }

export function isQstashConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.QSTASH_TOKEN?.trim())
}

function appUrl(env: NodeJS.ProcessEnv): string | null {
  const url = env.NEXT_PUBLIC_APP_URL?.trim()
  return url ? url.replace(/\/+$/, '') : null
}

/** The exact URL QStash signs its deliveries to; the `sub` claim of the JWS. */
export function workerUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  const base = appUrl(env)
  return base ? `${base}${NOTIFICATIONS_WORKER_PATH}` : null
}

export function dlqUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  const base = appUrl(env)
  return base ? `${base}${NOTIFICATIONS_DLQ_PATH}` : null
}

/**
 * The deduplication id for a wake.
 *
 * An enqueue wake dedupes on the outbox row's own key, so the two producers
 * of the same event (the webhook and the return page both finalizing one
 * order) publish one message. A retry wake dedupes on row + attempt, so the
 * same failed attempt cannot be scheduled twice while a different attempt
 * later can. A manual wake with nothing to key on collapses into a 30-second
 * bucket, which is the shortest interval a "drain now" button is worth.
 */
export function wakeDeduplicationId(message: WakeMessage, nowMs = Date.now()): string {
  if (message.reason === 'retry' && message.outbox_id) {
    return `notif:retry:${message.outbox_id}:${message.attempt ?? 0}`
  }
  if (message.dedupe_key) return `notif:wake:${message.dedupe_key}`
  if (message.outbox_id) return `notif:wake:${message.outbox_id}`
  return `notif:sweep:${Math.floor(nowMs / 30_000)}`
}

/**
 * Publish one wake. `delaySeconds` holds the message at Upstash until the
 * outbox row's `next_attempt_at`, which is what turns the drain's backoff
 * from "some sweep after" into "at". QStash caps the delay at seven days;
 * the outbox backoff maxes at 128 minutes, well inside.
 */
export async function publishDrainWake(
  message: WakeMessage,
  options: { delaySeconds?: number; env?: NodeJS.ProcessEnv; fetchImpl?: typeof fetch } = {},
): Promise<WakeOutcome> {
  const env = options.env ?? process.env
  const token = env.QSTASH_TOKEN?.trim()
  if (!token) return { transport: 'none', reason: 'QSTASH_TOKEN is not set' }

  const target = workerUrl(env)
  const callback = dlqUrl(env)
  if (!target || !callback) return { transport: 'none', reason: 'NEXT_PUBLIC_APP_URL is not set' }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Upstash-Retries': String(QSTASH_RETRIES),
    'Upstash-Failure-Callback': callback,
    'Upstash-Deduplication-Id': wakeDeduplicationId(message),
    // The worker authenticates QStash by signature, so the message must not
    // also carry the cron bearer; a message body is stored at Upstash.
    'Upstash-Forward-X-Kenyon-Wake': message.reason,
  }
  const delay = options.delaySeconds
  if (typeof delay === 'number' && Number.isFinite(delay) && delay > 0) {
    headers['Upstash-Delay'] = `${Math.ceil(delay)}s`
  }

  const doFetch = options.fetchImpl ?? fetch
  try {
    const res = await doFetch(`https://qstash.upstash.io/v2/publish/${target}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(message),
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      log.warn('notifications.wake_refused', { status: res.status, detail: detail.slice(0, 200) })
      return { transport: 'none', reason: `qstash ${res.status}` }
    }
    const data = (await res.json().catch(() => ({}))) as { messageId?: string }
    return { transport: 'qstash', messageId: data.messageId ?? 'unknown' }
  } catch (error) {
    log.warn('notifications.wake_failed', {
      reason: error instanceof Error ? error.message : String(error),
    })
    return { transport: 'none', reason: 'network' }
  }
}

/**
 * Is this POST really from QStash, for THIS route?
 *
 * The JWS `sub` claim binds the signature to the exact delivery URL, so the
 * worker and the DLQ each verify against their own path and a message signed
 * for one cannot be replayed at the other. Returns false (never throws) so
 * the caller answers 401 uniformly, including when no signing key is set.
 */
export function verifyNotificationsSignature(
  signature: string | null,
  rawBody: string,
  path: typeof NOTIFICATIONS_WORKER_PATH | typeof NOTIFICATIONS_DLQ_PATH,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const base = appUrl(env)
  if (!base) return false
  return verifyQstashSignature(signature, rawBody, `${base}${path}`)
}

/** Parse a wake body. Anything malformed is a plain sweep, never a crash. */
export function parseWakeMessage(rawBody: string): WakeMessage {
  if (!rawBody.trim()) return { reason: 'manual' }
  try {
    const parsed = JSON.parse(rawBody) as Partial<WakeMessage> | null
    if (!parsed || typeof parsed !== 'object') return { reason: 'manual' }
    const reason: WakeReason =
      parsed.reason === 'enqueue' || parsed.reason === 'retry' ? parsed.reason : 'manual'
    const message: WakeMessage = { reason }
    if (typeof parsed.outbox_id === 'string' && /^[0-9a-f-]{36}$/i.test(parsed.outbox_id)) {
      message.outbox_id = parsed.outbox_id
    }
    if (typeof parsed.dedupe_key === 'string' && parsed.dedupe_key.length <= 200) {
      message.dedupe_key = parsed.dedupe_key
    }
    if (typeof parsed.attempt === 'number' && Number.isInteger(parsed.attempt)) {
      message.attempt = parsed.attempt
    }
    return message
  } catch {
    return { reason: 'manual' }
  }
}
