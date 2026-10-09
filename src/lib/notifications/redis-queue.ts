import { log } from '@/lib/observability/log'
import { tryCommand, upstashConfig } from '@/lib/rate-limit/upstash'

/**
 * The Redis mirror of the outbox's retry schedule, and its dead-letter list.
 *
 * WHAT THIS IS AND IS NOT. The retry state of record is
 * `notification_outbox.next_attempt_at` / `attempts`, per leg, in Postgres.
 * This module never decides whether a row is retried; it keeps two Redis
 * structures BESIDE that truth so two questions can be answered without a
 * table scan and without the service role:
 *
 *   `notif:retry`  a sorted set, member = outbox id, score = the epoch ms
 *                  the next attempt is due. "What is waiting, and how long"
 *                  is one ZRANGEBYSCORE. The drain adds on a failed leg and
 *                  removes on settle (sent / dead / skipped / none).
 *
 *   `notif:dlq`    a capped list of JSON entries, newest first, written by
 *                  the QStash failure callback and by the drain when a row
 *                  goes `dead`. This is the dead-letter queue the goal names;
 *                  the outbox row's `dead` status is the same fact in
 *                  Postgres, and the admin queues page shows both so a
 *                  disagreement between them is visible rather than hidden.
 *
 * TRANSPORT. The fetch-based REST client in `src/lib/rate-limit/upstash.ts`,
 * for the reasons documented there. Every command is `tryCommand`, so a Redis
 * outage or an unconfigured Upstash degrades every function here to "no
 * answer" (`null`, `false`, `[]`) and is logged by the transport. Nothing in
 * this file can fail a send.
 *
 * VALUES ARE STRINGS ON THE WIRE. Upstash's REST protocol carries every
 * argument as a string, so scores are stringified here and parsed back with
 * `Number`; JSON entries are `JSON.stringify`'d whole and any entry that
 * does not parse on the way back is skipped, not thrown.
 */

export const RETRY_KEY = 'notif:retry'
export const DLQ_KEY = 'notif:dlq'

/** Newest 500 dead letters are kept; the outbox row is the permanent record. */
export const DLQ_CAP = 500

export interface DeadLetterEntry {
  /** Random id so a list entry can be removed by value on requeue. */
  id: string
  outboxId: string | null
  dedupeKey: string | null
  kind: string | null
  /** Which leg or which transport parked it. */
  source: 'email' | 'push' | 'qstash' | 'manual'
  reason: string
  /** The worker's HTTP status QStash saw, when the source is QStash. */
  status: number | null
  /** ISO timestamp. */
  at: string
}

export interface RetryEntry {
  outboxId: string
  dueAtMs: number
}

/**
 * The one seam. Defaults to the Upstash REST transport; tests inject a fake.
 * Returns `null` on any failure, matching `tryCommand`.
 */
export type RedisCommand = (args: readonly string[], event: string) => Promise<unknown | null>

function defaultCommand(): RedisCommand | null {
  const config = upstashConfig()
  if (!config) return null
  return (args, event) => tryCommand(config, args, event)
}

function resolve(command?: RedisCommand): RedisCommand | null {
  return command ?? defaultCommand()
}

export async function scheduleRetry(
  outboxId: string,
  dueAtMs: number,
  command?: RedisCommand,
): Promise<boolean> {
  const run = resolve(command)
  if (!run) return false
  const result = await run(
    ['ZADD', RETRY_KEY, String(Math.floor(dueAtMs)), outboxId],
    'notifications.retry_schedule_failed',
  )
  return result !== null
}

export async function clearRetry(outboxId: string, command?: RedisCommand): Promise<boolean> {
  const run = resolve(command)
  if (!run) return false
  const result = await run(['ZREM', RETRY_KEY, outboxId], 'notifications.retry_clear_failed')
  return result !== null
}

/** Rows whose retry instant has passed, oldest first. */
export async function dueRetries(
  nowMs: number,
  limit = 50,
  command?: RedisCommand,
): Promise<RetryEntry[]> {
  return listRetries({ maxScore: nowMs, limit }, command)
}

/** Everything scheduled, soonest first, for the admin queue page. */
export async function listRetries(
  options: { maxScore?: number; limit?: number } = {},
  command?: RedisCommand,
): Promise<RetryEntry[]> {
  const run = resolve(command)
  if (!run) return []
  const limit = Math.max(1, Math.min(options.limit ?? 50, 500))
  const max = typeof options.maxScore === 'number' ? String(Math.floor(options.maxScore)) : '+inf'
  const raw = await run(
    ['ZRANGEBYSCORE', RETRY_KEY, '-inf', max, 'WITHSCORES', 'LIMIT', '0', String(limit)],
    'notifications.retry_list_failed',
  )
  if (!Array.isArray(raw)) return []
  const entries: RetryEntry[] = []
  for (let i = 0; i + 1 < raw.length; i += 2) {
    const member = raw[i]
    const score = Number(raw[i + 1])
    if (typeof member === 'string' && Number.isFinite(score)) {
      entries.push({ outboxId: member, dueAtMs: score })
    }
  }
  return entries
}

export async function retryQueueSize(command?: RedisCommand): Promise<number | null> {
  const run = resolve(command)
  if (!run) return null
  const raw = await run(['ZCARD', RETRY_KEY], 'notifications.retry_size_failed')
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

function newEntryId(): string {
  return `dl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Park a dead letter. LPUSH then LTRIM, so the list can never grow past
 * `DLQ_CAP` however long nobody looks at it.
 */
export async function pushDeadLetter(
  entry: Omit<DeadLetterEntry, 'id' | 'at'> & Partial<Pick<DeadLetterEntry, 'id' | 'at'>>,
  command?: RedisCommand,
): Promise<DeadLetterEntry | null> {
  const run = resolve(command)
  if (!run) return null
  const full: DeadLetterEntry = {
    id: entry.id ?? newEntryId(),
    at: entry.at ?? new Date().toISOString(),
    outboxId: entry.outboxId,
    dedupeKey: entry.dedupeKey,
    kind: entry.kind,
    source: entry.source,
    reason: entry.reason.slice(0, 500),
    status: entry.status,
  }
  const pushed = await run(
    ['LPUSH', DLQ_KEY, JSON.stringify(full)],
    'notifications.dlq_push_failed',
  )
  if (pushed === null) return null
  await run(['LTRIM', DLQ_KEY, '0', String(DLQ_CAP - 1)], 'notifications.dlq_trim_failed')
  return full
}

function parseEntry(raw: unknown): DeadLetterEntry | null {
  if (typeof raw !== 'string') return null
  try {
    const parsed = JSON.parse(raw) as Partial<DeadLetterEntry> | null
    if (!parsed || typeof parsed !== 'object') return null
    if (typeof parsed.id !== 'string' || typeof parsed.reason !== 'string') return null
    return {
      id: parsed.id,
      outboxId: typeof parsed.outboxId === 'string' ? parsed.outboxId : null,
      dedupeKey: typeof parsed.dedupeKey === 'string' ? parsed.dedupeKey : null,
      kind: typeof parsed.kind === 'string' ? parsed.kind : null,
      source:
        parsed.source === 'email' ||
        parsed.source === 'push' ||
        parsed.source === 'qstash' ||
        parsed.source === 'manual'
          ? parsed.source
          : 'manual',
      reason: parsed.reason,
      status: typeof parsed.status === 'number' ? parsed.status : null,
      at: typeof parsed.at === 'string' ? parsed.at : '',
    }
  } catch {
    // A foreign or corrupt entry is skipped, not fatal: a DLQ that throws on
    // one bad row hides every good row behind it.
    return null
  }
}

/** Newest first. */
export async function listDeadLetters(
  limit = 50,
  command?: RedisCommand,
): Promise<DeadLetterEntry[]> {
  const run = resolve(command)
  if (!run) return []
  const n = Math.max(1, Math.min(limit, DLQ_CAP))
  const raw = await run(['LRANGE', DLQ_KEY, '0', String(n - 1)], 'notifications.dlq_list_failed')
  if (!Array.isArray(raw)) return []
  return raw.map(parseEntry).filter((e): e is DeadLetterEntry => e !== null)
}

export async function deadLetterCount(command?: RedisCommand): Promise<number | null> {
  const run = resolve(command)
  if (!run) return null
  const raw = await run(['LLEN', DLQ_KEY], 'notifications.dlq_size_failed')
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

/**
 * Remove one dead letter by id, for a requeue. LREM needs the exact stored
 * string, so the list is read and the matching entry re-serialised; the id
 * is what identifies it, not the position, because the list moves.
 */
export async function removeDeadLetter(id: string, command?: RedisCommand): Promise<boolean> {
  const run = resolve(command)
  if (!run) return false
  const raw = await run(
    ['LRANGE', DLQ_KEY, '0', String(DLQ_CAP - 1)],
    'notifications.dlq_list_failed',
  )
  if (!Array.isArray(raw)) return false
  const match = raw.find((item) => parseEntry(item)?.id === id)
  if (typeof match !== 'string') return false
  const removed = await run(['LREM', DLQ_KEY, '1', match], 'notifications.dlq_remove_failed')
  const n = Number(removed)
  if (!(Number.isFinite(n) && n > 0)) {
    log.warn('notifications.dlq_remove_missed', { id })
    return false
  }
  return true
}

/**
 * The outbox's own curve, exported so the wake delay and the row's
 * `next_attempt_at` are computed from ONE function: 2, 8, 32, 128 minutes.
 */
export function backoffMinutes(attempts: number): number {
  return 2 * 4 ** Math.max(0, attempts - 1)
}
