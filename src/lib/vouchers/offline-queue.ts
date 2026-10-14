import { isSettledScanOutcome } from '@/lib/vouchers/offline-scan'

/**
 * The web till's offline queue.
 *
 * WHY THIS EXISTS, MEASURED. `apps/mobile` has an offline queue and drains it
 * through `/api/supplier/vouchers/redeem-batch`, a route whose idempotency is
 * already correct. THE WEB TILL AT `/scan` HAS NEITHER. Its redeem call ends in
 * `catch { setError('שגיאת רשת, נסה שוב') }`, so a scan made while the shop's
 * connection is down is simply lost and the cashier is told to retry over the
 * link that just failed. The web till is the one a business opens on any device
 * without installing anything, which makes it the one most likely to be used on
 * bad wifi.
 *
 * Nothing new is needed on the server: this reuses the batch route and the
 * settlement rule in `offline-scan.ts`.
 *
 * THE IDEMPOTENCY KEY IS MINTED WHEN THE SCAN HAPPENS, NOT WHEN IT IS SENT, and
 * that is the property the whole design rests on. `redeem_voucher` keys its
 * effect on it, so one key sent five times burns one voucher and reports
 * `already_redeemed` for the rest. A key minted per ATTEMPT would make every
 * retry a fresh redemption request - which is exactly what the online path did
 * before this, harmlessly, because it never retried.
 *
 * WHAT AN OFFLINE TILL CANNOT DO, AND MUST SAY. Offline, the lookup fails too,
 * so the till does not know whether the voucher is valid, expired, already
 * spent or fake. Queuing is therefore RECORDING A SCAN, not approving one, and
 * the UI has to say so - a cashier who reads "saved" as "accepted" hands over
 * goods against a voucher that may be worthless. The verdicts arrive when the
 * queue drains.
 */

export type QueuedScan = {
  /** Minted at scan time and never regenerated. This is what makes replay safe. */
  idempotencyKey: string
  code: string | null
  qrPayload: string | null
  scanMethod: 'camera' | 'manual'
  /** Device clock, for display only: the server never trusts it. */
  scannedAt: string
}

export type DrainResult = { idempotency_key: string; outcome: string }

/**
 * A hard cap, and the direction it drops from matters.
 *
 * A till left offline for a week must not grow an unbounded queue in
 * `localStorage`, which has a few megabytes and starts throwing when it is
 * full - and a storage exception in the middle of a scan would take the till
 * down completely. Two hundred is far above a real day's redemptions for one
 * counter and far below anything that strains storage.
 *
 * WHEN IT IS FULL THE OLDEST IS DROPPED, NOT THE NEWEST. The cashier is
 * standing in front of the customer whose scan is happening now; losing that
 * one is a customer turned away, while losing a week-old scan is a
 * reconciliation problem. Both are bad and only one is in the room.
 */
export const MAX_QUEUED_SCANS = 200

export function enqueue(queue: readonly QueuedScan[], scan: QueuedScan): QueuedScan[] {
  // A key already in the queue is the same scan submitted twice by a
  // double-tapped button. Ignored rather than appended: two entries would both
  // drain, and while the database would collapse them, the cashier would see
  // the same voucher listed twice and count it twice.
  if (queue.some((item) => item.idempotencyKey === scan.idempotencyKey)) return [...queue]

  const next = [...queue, scan]
  return next.length > MAX_QUEUED_SCANS ? next.slice(next.length - MAX_QUEUED_SCANS) : next
}

/**
 * Removes what the server has settled and KEEPS what it has not.
 *
 * The rule is `offline-scan.ts`'s: every verdict about the voucher is final and
 * only an infrastructure failure is retryable. A till that kept `expired` in
 * the queue would retry the same refusal forever and show a pending count that
 * never reaches zero - and `expired` is the outcome a real till hits most often
 * after an outage, because an outage is exactly when a queued scan sits long
 * enough to cross a deadline.
 */
export function removeSettled(
  queue: readonly QueuedScan[],
  results: readonly DrainResult[],
): QueuedScan[] {
  const settled = new Set(
    results.filter((result) => isSettledScanOutcome(result.outcome)).map((r) => r.idempotency_key),
  )
  return queue.filter((item) => !settled.has(item.idempotencyKey))
}

/** The body the batch route expects. Order is preserved: it drains sequentially. */
export function drainPayload(queue: readonly QueuedScan[]): {
  items: Array<{
    code?: string
    qr_payload?: string
    scan_method: 'camera' | 'manual'
    idempotency_key: string
  }>
} {
  return {
    items: queue.map((item) => ({
      ...(item.qrPayload ? { qr_payload: item.qrPayload } : {}),
      ...(item.code && !item.qrPayload ? { code: item.code } : {}),
      scan_method: item.scanMethod,
      idempotency_key: item.idempotencyKey,
    })),
  }
}

const STORAGE_KEY = 'ke.till.offline-queue.v1'

/**
 * Reading NEVER throws.
 *
 * `localStorage` is unavailable in a private window on some browsers, can be
 * disabled entirely, and returns whatever was last written - which after a
 * version change or a manual edit may not be JSON at all. Every one of those
 * has to degrade to an empty queue rather than to a till that will not open.
 */
export function readQueue(storage: Storage | null = safeStorage()): QueuedScan[] {
  if (!storage) return []
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isQueuedScan)
  } catch {
    return []
  }
}

/** Writing never throws either: a full quota must not break a scan. */
export function writeQueue(
  queue: readonly QueuedScan[],
  storage: Storage | null = safeStorage(),
): boolean {
  if (!storage) return false
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(queue))
    return true
  } catch {
    return false
  }
}

function isQueuedScan(value: unknown): value is QueuedScan {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.idempotencyKey === 'string' &&
    candidate.idempotencyKey.length >= 8 &&
    (candidate.code === null || typeof candidate.code === 'string') &&
    (candidate.qrPayload === null || typeof candidate.qrPayload === 'string') &&
    (candidate.scanMethod === 'camera' || candidate.scanMethod === 'manual') &&
    typeof candidate.scannedAt === 'string'
  )
}

/**
 * `null` MEANS "THERE IS NO STORAGE" AND `undefined` MEANS "WORK IT OUT".
 *
 * The distinction is not pedantry: a default parameter is only applied for
 * `undefined`, so with `Storage | undefined` a caller that has ALREADY
 * established there is no storage cannot say so - passing `undefined` runs the
 * default and finds one anyway. A test asserting the no-storage path is what
 * caught it, and the same shape would have hidden the real case, which is a
 * server render passing through a value it does not have.
 */
function safeStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

/** One key per scan, minted at scan time. */
export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now()}-${Math.round(Math.random() * 1e9)}-${Math.round(Math.random() * 1e9)}`
}
