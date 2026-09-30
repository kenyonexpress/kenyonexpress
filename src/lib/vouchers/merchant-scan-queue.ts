import { isSettledScanOutcome } from './offline-scan'

/**
 * The web till's offline scan queue (STEP 14, /merchant/scan).
 *
 * The same contract the native app keeps in apps/mobile/src/lib/supplier/
 * queue.ts, restated for a browser, and the same two halves make it safe:
 *
 *   1. Every scan mints an `idempotencyKey` HERE, before the first request,
 *      and `redeem_voucher` (051) keys its whole effect on it. A key that was
 *      sent, timed out, queued and re-sent burns the voucher once and gets
 *      `replayed` the second time. Two devices that scan the same voucher
 *      offline collide on the VOUCHER, not on the key, so the second is told
 *      `already_redeemed` instead of burning it again.
 *   2. The device drops an item only when the server said it was settled
 *      (lib/vouchers/offline-scan.ts). A refusal is an answer; a dropped
 *      connection is not.
 *
 * ONLINE FIRST, AND THE FALLBACK IS QUEUEING, NEVER ASSUMING. A scan whose
 * request never came back is stored and the cashier is told it is WAITING,
 * not that it succeeded. A customer whose voucher was actually expired must not
 * walk out having been shown a green tick.
 *
 * STORAGE. `localStorage` under one key, synchronous and atomic per write, so
 * a tab that dies mid-scan leaves either the old list or the new one and never
 * a torn write. The queue holds voucher codes, which are bearer tokens for a
 * discount; the exposure is bounded the same way the app bounds it: an item
 * lives only until the next successful drain, the codes are for vouchers this
 * supplier may burn anyway, and `clearQueue` runs on sign-out. Nothing here
 * touches IndexedDB: a day at a till is tens of items, not thousands.
 *
 * Every function takes its `Storage` and `fetch` as arguments. That is what
 * makes the module testable without a browser, and it is also what keeps it
 * honest: the component decides when to sync, this decides what a sync means.
 */

export const MERCHANT_SCAN_QUEUE_KEY = 'ke:merchant-scan-queue:v1'

/** The batch route refuses more than this in one request. */
export const DRAIN_BATCH_LIMIT = 50

export type ScanMethod = 'camera' | 'manual'

export type QueuedScan = {
  idempotencyKey: string
  code?: string
  qrPayload?: string
  scanMethod: ScanMethod
  scannedAt: string
  /** Shown in the pending list so the cashier recognises what is waiting. */
  label: string
}

export type ScanOutcome = {
  idempotency_key: string
  outcome: string
  replayed: boolean
  code: string | null
  message: string | null
}

/** The slice of `Storage` the queue uses; `localStorage` satisfies it. */
export type QueueStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export function readQueue(store: QueueStore): QueuedScan[] {
  try {
    const raw = store.getItem(MERCHANT_SCAN_QUEUE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isQueuedScan)
  } catch {
    // A corrupt queue is not recoverable and must not brick the scanner. The
    // cost is the pending scans; the alternative is a till that cannot open.
    return []
  }
}

function isQueuedScan(value: unknown): value is QueuedScan {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return (
    typeof item.idempotencyKey === 'string' &&
    item.idempotencyKey.length >= 8 &&
    (item.scanMethod === 'camera' || item.scanMethod === 'manual') &&
    typeof item.scannedAt === 'string' &&
    typeof item.label === 'string' &&
    (typeof item.code === 'string' || typeof item.qrPayload === 'string')
  )
}

function writeQueue(store: QueueStore, items: QueuedScan[]): void {
  store.setItem(MERCHANT_SCAN_QUEUE_KEY, JSON.stringify(items))
}

/** FIFO, and the same key twice is a double tap, not two sales. */
export function enqueueScan(store: QueueStore, scan: QueuedScan): QueuedScan[] {
  const items = readQueue(store)
  if (items.some((item) => item.idempotencyKey === scan.idempotencyKey)) return items
  const next = [...items, scan]
  writeQueue(store, next)
  return next
}

/** Removes exactly the keys the server said it had settled. */
export function clearSettled(store: QueueStore, settledKeys: readonly string[]): QueuedScan[] {
  const items = readQueue(store)
  if (settledKeys.length === 0) return items
  const settled = new Set(settledKeys)
  const next = items.filter((item) => !settled.has(item.idempotencyKey))
  writeQueue(store, next)
  return next
}

export function clearQueue(store: QueueStore): void {
  store.removeItem(MERCHANT_SCAN_QUEUE_KEY)
}

/**
 * Unique per scan, stable across retries. `crypto.randomUUID` where the
 * browser has it (every browser that has a camera API does); a time-plus-random
 * string otherwise, so an old WebView still gets a key that satisfies the
 * route's `min(8)` rather than a queue it cannot drain.
 */
export function newIdempotencyKey(): string {
  const c = typeof globalThis.crypto !== 'undefined' ? globalThis.crypto : undefined
  if (c && typeof c.randomUUID === 'function') return `scan-${c.randomUUID()}`
  const random = Math.random().toString(36).slice(2, 12)
  const time = Date.now().toString(36)
  return `scan-${time}-${random}`
}

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>

export type QueueDeps = {
  store: QueueStore
  fetch: FetchLike
  now?: () => Date
}

export type RedeemedVoucher = {
  code: string | null
  product_name: string | null
  customer_name: string | null
  face_value_agorot: number | null
  coupon_price_agorot: number | null
  remaining_amount_due_agorot: number | null
  redeemed_at: string | null
}

export type SubmitResult =
  | {
      kind: 'settled'
      outcome: string
      message: string
      replayed: boolean
      voucher: RedeemedVoucher | null
    }
  | { kind: 'queued'; pending: number; idempotencyKey: string }

type RedeemBody = {
  outcome?: unknown
  message?: unknown
  replayed?: unknown
  voucher?: RedeemedVoucher | null
}

/**
 * One scan. Posts to the single-scan route; on anything that is not a verdict
 * it queues the SAME key so the drain replays rather than repeats.
 *
 * What counts as "not a verdict": the request never returned (offline, DNS,
 * the tab was suspended), a 5xx (the RPC itself failed and the route says so
 * with a system-error message), and a 429 (the server declined to look).
 * A 401 is a verdict about the SESSION, not the voucher, and is reported as
 * such rather than queued: a device that has been signed out must not hold
 * scans it cannot send, and the cashier has to sign in before the next one
 * anyway.
 */
export async function submitScan(
  deps: QueueDeps,
  args: {
    code?: string
    qrPayload?: string
    scanMethod: ScanMethod
    label: string
    /** Re-used when the cashier retries the same scan; minted when absent. */
    idempotencyKey?: string
  },
): Promise<SubmitResult> {
  const idempotencyKey = args.idempotencyKey ?? newIdempotencyKey()
  const scannedAt = (deps.now?.() ?? new Date()).toISOString()

  let response: Response | null = null
  try {
    response = await deps.fetch('/api/supplier/vouchers/redeem', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        code: args.code,
        qr_payload: args.qrPayload,
        scan_method: args.scanMethod,
        idempotency_key: idempotencyKey,
      }),
    })
  } catch {
    response = null
  }

  if (response && response.status < 500 && response.status !== 429) {
    const body = (await response.json().catch(() => null)) as RedeemBody | null
    if (body && typeof body.outcome === 'string') {
      return {
        kind: 'settled',
        outcome: body.outcome,
        message: typeof body.message === 'string' ? body.message : '',
        replayed: body.replayed === true,
        voucher: body.voucher ?? null,
      }
    }
  }

  const pending = enqueueScan(deps.store, {
    idempotencyKey,
    code: args.code,
    qrPayload: args.qrPayload,
    scanMethod: args.scanMethod,
    scannedAt,
    label: args.label,
  })
  return { kind: 'queued', pending: pending.length, idempotencyKey }
}

export type DrainResult =
  | { kind: 'empty' }
  | { kind: 'drained'; attempted: number; results: ScanOutcome[]; stillPending: number }
  /** The request never came back; nothing was dropped. */
  | { kind: 'offline'; stillPending: number }
  /** The session is gone; nothing was dropped, and a sign-in is needed first. */
  | { kind: 'unauthorized'; stillPending: number }
  /** The server declined to look; nothing was dropped. */
  | { kind: 'rate_limited'; stillPending: number }
  /** Any other non-2xx; nothing was dropped. */
  | { kind: 'failed'; status: number; stillPending: number }

type BatchBody = {
  ok?: unknown
  results?: unknown
  settled?: unknown
}

/**
 * Sends the oldest DRAIN_BATCH_LIMIT items and clears only what the server
 * settled. A larger backlog drains over consecutive calls rather than in one
 * request that can time out and lose the lot.
 *
 * The queue is left untouched on every path that is not a 2xx with `ok: true`.
 * Getting this wrong in either direction is a real failure: forget a retryable
 * item and a voucher is never redeemed; drop an unsent one and the customer's
 * coupon is spent on nothing.
 */
export async function drainQueue(deps: QueueDeps): Promise<DrainResult> {
  const items = readQueue(deps.store)
  if (items.length === 0) return { kind: 'empty' }
  const batch = items.slice(0, DRAIN_BATCH_LIMIT)

  let response: Response | null = null
  try {
    response = await deps.fetch('/api/supplier/vouchers/redeem-batch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        items: batch.map((item) => ({
          code: item.code,
          qr_payload: item.qrPayload,
          scan_method: item.scanMethod,
          idempotency_key: item.idempotencyKey,
          scanned_at: item.scannedAt,
        })),
      }),
    })
  } catch {
    return { kind: 'offline', stillPending: items.length }
  }

  if (response.status === 401) return { kind: 'unauthorized', stillPending: items.length }
  if (response.status === 429) return { kind: 'rate_limited', stillPending: items.length }

  const body = (await response.json().catch(() => null)) as BatchBody | null
  if (!response.ok || !body || body.ok !== true) {
    return { kind: 'failed', status: response.status, stillPending: items.length }
  }

  const results = Array.isArray(body.results) ? (body.results as ScanOutcome[]) : []
  // The server's list is authoritative, and the rule is re-applied here so a
  // server that forgot to send `settled` still cannot make the device drop a
  // retryable item or keep a settled one.
  const settled = Array.isArray(body.settled)
    ? (body.settled as string[])
    : results.filter((r) => isSettledScanOutcome(r.outcome)).map((r) => r.idempotency_key)
  const remaining = clearSettled(deps.store, settled)

  return {
    kind: 'drained',
    attempted: batch.length,
    results,
    stillPending: remaining.length,
  }
}
