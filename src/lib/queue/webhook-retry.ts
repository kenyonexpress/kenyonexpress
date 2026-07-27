/**
 * Retry queue for webhook processing, backed by Upstash Redis REST
 * (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN, the names
 * ARCHITECTURE-SECURITY.md already reserves). No SDK dependency: the REST
 * protocol is a single POST with a command array.
 *
 * A webhook that authenticated but could not complete processing (Cardcom
 * verify unreachable, finalize error) is parked here and re-driven by
 * /api/payments/cardcom/retry (cron). Processing stays idempotent end to end
 * (payment_webhook_events dedup + finalize replay guards), so re-driving a job
 * that actually succeeded is a no-op.
 *
 * Without Upstash env (tests, local dev) an in-process queue takes over so the
 * flow is exercisable end to end; it does not survive a restart, which is
 * acceptable exactly and only there.
 */

export type WebhookRetryJob = {
  provider: 'cardcom'
  lowProfileId: string
  externalEventId: string
  attempt: number
  enqueuedAt: string
}

export const WEBHOOK_RETRY_QUEUE_KEY = 'ke:payments:webhook-retry'
export const WEBHOOK_RETRY_DEAD_KEY = 'ke:payments:webhook-retry:dead'
export const WEBHOOK_RETRY_MAX_ATTEMPTS = 5

type UpstashConfig = { url: string; token: string }

function upstashConfig(source: NodeJS.ProcessEnv = process.env): UpstashConfig | null {
  const url = source.UPSTASH_REDIS_REST_URL?.replace(/\/$/, '')
  const token = source.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  return { url, token }
}

export function isRetryQueuePersistent(): boolean {
  return upstashConfig() !== null
}

async function redisCommand(config: UpstashConfig, command: string[]): Promise<unknown> {
  const response = await fetch(config.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  })
  if (!response.ok) {
    throw new Error(`Upstash command ${command[0]} failed: HTTP ${response.status}`)
  }
  const body = (await response.json()) as { result?: unknown; error?: string }
  if (body.error) throw new Error(`Upstash command ${command[0]} failed: ${body.error}`)
  return body.result
}

// In-memory fallback, keyed like Redis so the two paths behave the same.
const memoryQueues = new Map<string, string[]>()

function memoryQueue(key: string): string[] {
  let queue = memoryQueues.get(key)
  if (!queue) {
    queue = []
    memoryQueues.set(key, queue)
  }
  return queue
}

/** Test hook: drops every in-memory queue. No effect on Upstash. */
export function resetInMemoryQueues(): void {
  memoryQueues.clear()
}

async function push(key: string, value: string): Promise<void> {
  const config = upstashConfig()
  if (config) {
    await redisCommand(config, ['LPUSH', key, value])
    return
  }
  memoryQueue(key).unshift(value)
}

async function pop(key: string): Promise<string | null> {
  const config = upstashConfig()
  if (config) {
    const result = await redisCommand(config, ['RPOP', key])
    return typeof result === 'string' ? result : null
  }
  return memoryQueue(key).pop() ?? null
}

async function depth(key: string): Promise<number> {
  const config = upstashConfig()
  if (config) {
    const result = await redisCommand(config, ['LLEN', key])
    return typeof result === 'number' ? result : 0
  }
  return memoryQueue(key).length
}

export async function enqueueWebhookRetry(job: Omit<WebhookRetryJob, 'enqueuedAt'>): Promise<void> {
  const full: WebhookRetryJob = { ...job, enqueuedAt: new Date().toISOString() }
  await push(WEBHOOK_RETRY_QUEUE_KEY, JSON.stringify(full))
}

/** Exceeded jobs go to the dead-letter list for manual inspection, never lost. */
export async function deadLetterWebhookRetry(job: WebhookRetryJob): Promise<void> {
  await push(WEBHOOK_RETRY_DEAD_KEY, JSON.stringify(job))
}

export async function popWebhookRetry(): Promise<WebhookRetryJob | null> {
  const raw = await pop(WEBHOOK_RETRY_QUEUE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as WebhookRetryJob
    if (parsed.provider === 'cardcom' && typeof parsed.lowProfileId === 'string') {
      return parsed
    }
  } catch {
    // fall through: malformed jobs die here rather than looping forever
  }
  await push(WEBHOOK_RETRY_DEAD_KEY, raw)
  return null
}

export async function retryQueueDepth(): Promise<{ pending: number; dead: number }> {
  return {
    pending: await depth(WEBHOOK_RETRY_QUEUE_KEY),
    dead: await depth(WEBHOOK_RETRY_DEAD_KEY),
  }
}
