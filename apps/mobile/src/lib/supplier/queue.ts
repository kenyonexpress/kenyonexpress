import AsyncStorage from '@react-native-async-storage/async-storage'

/**
 * The offline scan queue.
 *
 * WHAT MAKES A REPLAY SAFE IS NOT IN THIS FILE. Every item carries an
 * `idempotencyKey` minted HERE, at the moment of the scan, and
 * `redeem_voucher` keys its whole effect on it. So the queue may be drained
 * twice, drained from two devices, or drained after the app was killed
 * mid-request, and each voucher is still burned exactly once. This module only
 * has to not lose items and not reorder them.
 *
 * ASYNCSTORAGE AND NOT SECURESTORE. A queued scan holds a voucher code, which
 * is a bearer token for a discount, so the instinct is the Keychain. But
 * SecureStore stores one string under 2 KB per key, and a day's queue is a list
 * - it would have to be chunked, and a half-written chunk is a lost scan. The
 * exposure is bounded differently instead: an item lives in the queue only
 * until the next successful drain, the codes in it are for vouchers this
 * supplier is entitled to burn anyway, and the app clears the queue on sign-out.
 *
 * ORDER IS FIFO AND IS PRESERVED. Two offline scans of the same voucher must
 * resolve to one success and one `already_redeemed`, in the order the cashier
 * made them.
 */

const QUEUE_KEY = 'ke.supplier.scan_queue.v1'

export type QueuedScan = {
  idempotencyKey: string
  code?: string
  qrPayload?: string
  scanMethod: 'camera' | 'manual'
  staffId?: string
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

async function readAll(): Promise<QueuedScan[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as QueuedScan[]) : []
  } catch {
    // A corrupt queue is not recoverable and must not brick the scanner. The
    // cost is the pending scans; the alternative is a till that cannot open.
    return []
  }
}

async function writeAll(items: QueuedScan[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(items))
}

export async function enqueueScan(scan: QueuedScan): Promise<void> {
  const items = await readAll()
  // Same key twice is the cashier double-tapping, not two sales.
  if (items.some((item) => item.idempotencyKey === scan.idempotencyKey)) return
  items.push(scan)
  await writeAll(items)
}

export async function pendingScans(): Promise<QueuedScan[]> {
  return readAll()
}

export async function pendingCount(): Promise<number> {
  return (await readAll()).length
}

/** Removes exactly the keys the server said it had settled. */
export async function clearSettled(settledKeys: readonly string[]): Promise<void> {
  if (settledKeys.length === 0) return
  const settled = new Set(settledKeys)
  const items = await readAll()
  await writeAll(items.filter((item) => !settled.has(item.idempotencyKey)))
}

export async function clearQueue(): Promise<void> {
  await AsyncStorage.removeItem(QUEUE_KEY)
}

/**
 * A key that is unique per scan and stable across retries.
 *
 * Not `crypto.randomUUID()`: it is missing on Hermes without a polyfill, and a
 * key that throws on some devices is a queue that cannot be drained on them.
 * The device id is not in it either - two devices scanning the same voucher
 * offline MUST collide on the voucher, not on the key, so that the second one
 * is told `already_redeemed` rather than burning it again.
 */
export function newIdempotencyKey(): string {
  const random = Math.random().toString(36).slice(2, 12)
  const time = Date.now().toString(36)
  return `scan-${time}-${random}`
}
