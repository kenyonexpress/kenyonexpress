import { type OffloadTask, offloadTaskSchema } from '../../../../../src/lib/workers/task-contracts'
import {
  SIGNATURE_HEADER,
  verifyTaskSignature,
} from '../../../../../src/lib/workers/task-signature'

/**
 * KenyonExpress async-offload Worker.
 *
 *   POST /tasks   signed by the Next app (X-KE-Signature, HMAC over
 *                 `${t}.${body}`), validated against the shared schema and
 *                 pushed onto a Cloudflare Queue. Answers 202 in milliseconds.
 *   queue()       the consumer. One message is one task; each URL or target
 *                 inside it is attempted on its own and the message is
 *                 retried (with backoff) only when something failed. After
 *                 `max_retries` the platform moves it to the dead-letter
 *                 queue named in wrangler.toml, where it stays for a person.
 *
 * The contracts and the signature live in src/lib/workers and are imported
 * by relative path, so this file cannot drift from the producer. The types
 * below are the small slice of Cloudflare's runtime this Worker touches,
 * declared locally so the repository needs no `@cloudflare/workers-types`
 * (the worktree's node_modules is shared; see lib/rate-limit/upstash.ts).
 */

interface QueueMessage<T> {
  readonly id: string
  readonly attempts: number
  readonly body: T
  ack(): void
  retry(options?: { delaySeconds?: number }): void
}

interface MessageBatch<T> {
  readonly queue: string
  readonly messages: readonly QueueMessage<T>[]
}

interface Queue<T> {
  send(body: T, options?: { delaySeconds?: number }): Promise<void>
}

export interface Env {
  /** Same value as CF_ASYNC_WORKER_SECRET on the Next side. `wrangler secret put TASK_SECRET`. */
  TASK_SECRET: string
  ASYNC_QUEUE: Queue<OffloadTask>
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })

/** Attempts per message before the platform dead-letters it; mirrors wrangler.toml. */
export const MAX_ATTEMPTS = 5

/** Exponential, capped at ten minutes: 30s, 60s, 120s, 240s, 480s. */
export function retryDelaySeconds(attempts: number): number {
  return Math.min(600, 30 * 2 ** Math.max(0, attempts - 1))
}

export async function handleTaskRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  if (url.pathname === '/health') return json({ ok: true })
  if (url.pathname !== '/tasks') return json({ ok: false, error: 'not found' }, 404)
  if (request.method !== 'POST') return json({ ok: false, error: 'method' }, 405)

  const body = await request.text()
  const verdict = await verifyTaskSignature(
    env.TASK_SECRET,
    request.headers.get(SIGNATURE_HEADER),
    body,
  )
  if (!verdict.ok) return json({ ok: false, error: verdict.reason }, 401)

  let parsed: ReturnType<typeof offloadTaskSchema.safeParse>
  try {
    parsed = offloadTaskSchema.safeParse(JSON.parse(body))
  } catch {
    return json({ ok: false, error: 'invalid json' }, 400)
  }
  if (!parsed.success) return json({ ok: false, error: 'invalid task' }, 400)

  await env.ASYNC_QUEUE.send(parsed.data)
  return json({ ok: true, queued: true, type: parsed.data.type }, 202)
}

async function warmOne(target: string): Promise<boolean> {
  try {
    const res = await fetch(target, {
      method: 'GET',
      headers: { 'User-Agent': 'kenyonexpress-async-offload/1', Accept: 'text/html' },
      signal: AbortSignal.timeout(10_000),
    })
    return res.ok
  } catch {
    return false
  }
}

async function postOne(target: { url: string; body: string; headers?: Record<string, string> }) {
  try {
    const res = await fetch(target.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(target.headers ?? {}) },
      body: target.body,
      signal: AbortSignal.timeout(10_000),
    })
    // 4xx is the receiver's answer, not our failure; only a 5xx or a
    // transport error is worth another attempt.
    return res.status < 500
  } catch {
    return false
  }
}

/** Runs one task; returns how many parts failed. Pure over `fetch`, so it is testable. */
export async function runTask(task: OffloadTask): Promise<{ total: number; failed: number }> {
  if (task.type === 'warm-urls') {
    const results = await Promise.all(task.urls.map(warmOne))
    return { total: results.length, failed: results.filter((ok) => !ok).length }
  }
  const results = await Promise.all(task.targets.map(postOne))
  return { total: results.length, failed: results.filter((ok) => !ok).length }
}

export async function consumeBatch(batch: MessageBatch<OffloadTask>): Promise<void> {
  for (const message of batch.messages) {
    const parsed = offloadTaskSchema.safeParse(message.body)
    if (!parsed.success) {
      // Will never parse on retry either; acknowledging is what keeps the
      // dead-letter queue for tasks that failed, not tasks that were wrong.
      message.ack()
      continue
    }
    const { total, failed } = await runTask(parsed.data)
    if (failed === 0) {
      message.ack()
      continue
    }
    console.error(
      JSON.stringify({
        event: 'offload.task_partial',
        type: parsed.data.type,
        total,
        failed,
        attempt: message.attempts,
      }),
    )
    message.retry({ delaySeconds: retryDelaySeconds(message.attempts) })
  }
}

export default {
  fetch: handleTaskRequest,
  queue: consumeBatch,
}
