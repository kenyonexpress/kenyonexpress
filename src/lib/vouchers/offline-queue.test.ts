import {
  MAX_QUEUED_SCANS,
  type QueuedScan,
  drainPayload,
  enqueue,
  newIdempotencyKey,
  readQueue,
  removeSettled,
  writeQueue,
} from '@/lib/vouchers/offline-queue'
import { describe, expect, it } from 'vitest'

const scan = (key: string, over: Partial<QueuedScan> = {}): QueuedScan => ({
  idempotencyKey: key,
  code: 'ABCDEFGHJK',
  qrPayload: null,
  scanMethod: 'manual',
  scannedAt: '2026-09-09T12:00:00.000Z',
  ...over,
})

/** A localStorage stand-in, plus the two ways a real one misbehaves. */
function fakeStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial))
  return {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => void map.delete(key),
    setItem: (key: string, value: string) => void map.set(key, value),
  } as Storage
}

describe('enqueue', () => {
  it('appends a scan', () => {
    expect(enqueue([], scan('key-00000001'))).toHaveLength(1)
  })

  it('IGNORES a key already queued, which is a double-tapped button', () => {
    // The database would collapse the replay, but the cashier would see the
    // same voucher twice in the pending list and count it twice.
    const queue = enqueue([], scan('key-00000001'))
    expect(enqueue(queue, scan('key-00000001'))).toHaveLength(1)
  })

  it('caps the queue and DROPS THE OLDEST, not the newest', () => {
    // The cashier is standing in front of the customer whose scan is happening
    // now. Losing that one turns a customer away; losing a week-old scan is a
    // reconciliation problem.
    let queue: QueuedScan[] = []
    for (let i = 0; i < MAX_QUEUED_SCANS + 5; i++) {
      queue = enqueue(queue, scan(`key-${String(i).padStart(8, '0')}`))
    }
    expect(queue).toHaveLength(MAX_QUEUED_SCANS)
    expect(queue.at(-1)?.idempotencyKey).toBe(
      `key-${String(MAX_QUEUED_SCANS + 4).padStart(8, '0')}`,
    )
    expect(queue[0]?.idempotencyKey).toBe('key-00000005')
  })

  it('does not mutate the queue it was given', () => {
    const queue = [scan('key-00000001')]
    enqueue(queue, scan('key-00000002'))
    expect(queue).toHaveLength(1)
  })
})

describe('removeSettled', () => {
  const queue = [scan('key-a0000001'), scan('key-b0000002'), scan('key-c0000003')]

  it('drops a decided voucher, whatever the decision was', () => {
    const left = removeSettled(queue, [
      { idempotency_key: 'key-a0000001', outcome: 'success' },
      { idempotency_key: 'key-b0000002', outcome: 'already_redeemed' },
    ])
    expect(left.map((item) => item.idempotencyKey)).toEqual(['key-c0000003'])
  })

  it('DROPS an expired scan rather than retrying a refusal forever', () => {
    // `expired` is the outcome a real till hits most often after an outage,
    // because an outage is exactly when a queued scan sits long enough to
    // cross a deadline. Keeping it makes the pending count never reach zero.
    const left = removeSettled(queue, [{ idempotency_key: 'key-a0000001', outcome: 'expired' }])
    expect(left.map((item) => item.idempotencyKey)).not.toContain('key-a0000001')
  })

  it('KEEPS an infrastructure failure, because the server decided nothing', () => {
    const left = removeSettled(queue, [
      { idempotency_key: 'key-a0000001', outcome: 'error' },
      { idempotency_key: 'key-b0000002', outcome: 'rate_limited' },
    ])
    expect(left).toHaveLength(3)
  })

  it('leaves a scan the drain never reported on', () => {
    // A drain cut off halfway must not silently discard what it never reached.
    expect(removeSettled(queue, [])).toHaveLength(3)
  })
})

describe('drainPayload', () => {
  it('sends the QR payload alone when there is one, never both', () => {
    const payload = drainPayload([
      scan('key-a0000001', { qrPayload: 'signed.token', code: 'ABCDEFGHJK' }),
    ])
    expect(payload.items[0]).toEqual({
      qr_payload: 'signed.token',
      scan_method: 'manual',
      idempotency_key: 'key-a0000001',
    })
    expect(payload.items[0]).not.toHaveProperty('code')
  })

  it('sends the code when there is no payload', () => {
    const payload = drainPayload([scan('key-a0000001')])
    expect(payload.items[0]?.code).toBe('ABCDEFGHJK')
  })

  it('preserves order, because the route drains sequentially', () => {
    // Two offline scans of the SAME voucher must resolve to one success and one
    // already_redeemed IN THE ORDER THEY HAPPENED.
    const payload = drainPayload([scan('key-a0000001'), scan('key-b0000002')])
    expect(payload.items.map((item) => item.idempotency_key)).toEqual([
      'key-a0000001',
      'key-b0000002',
    ])
  })
})

describe('storage', () => {
  it('round trips', () => {
    const storage = fakeStorage()
    writeQueue([scan('key-a0000001')], storage)
    expect(readQueue(storage).map((item) => item.idempotencyKey)).toEqual(['key-a0000001'])
  })

  it('returns an empty queue rather than throwing on corrupt JSON', () => {
    expect(readQueue(fakeStorage({ 'ke.till.offline-queue.v1': 'not json' }))).toEqual([])
  })

  it('returns an empty queue when the stored value is not an array', () => {
    expect(readQueue(fakeStorage({ 'ke.till.offline-queue.v1': '{"a":1}' }))).toEqual([])
  })

  it('drops entries that do not look like scans instead of trusting them', () => {
    // Whatever is in storage was last written by some version of this code, or
    // by hand. A malformed entry must not reach the drain payload.
    const storage = fakeStorage({
      'ke.till.offline-queue.v1': JSON.stringify([
        scan('key-a0000001'),
        { idempotencyKey: 'short' },
        null,
        { idempotencyKey: 'key-b0000002', scanMethod: 'telepathy' },
      ]),
    })
    expect(readQueue(storage).map((item) => item.idempotencyKey)).toEqual(['key-a0000001'])
  })

  it('never throws when storage is unavailable', () => {
    // `null` is "there is none", not `undefined`: a default parameter only
    // applies for `undefined`, so a caller that has already established there
    // is no storage could not say so. The first version of this test is what
    // caught that, by passing `undefined` and getting jsdom's localStorage.
    expect(readQueue(null)).toEqual([])
    expect(writeQueue([scan('key-a0000001')], null)).toBe(false)
  })

  it('never throws when the quota is full: a full disk must not break a scan', () => {
    const storage = fakeStorage()
    storage.setItem = () => {
      throw new Error('QuotaExceededError')
    }
    expect(writeQueue([scan('key-a0000001')], storage)).toBe(false)
  })

  it('never throws when reading itself throws', () => {
    const storage = fakeStorage()
    storage.getItem = () => {
      throw new Error('SecurityError')
    }
    expect(readQueue(storage)).toEqual([])
  })
})

describe('newIdempotencyKey', () => {
  it('is long enough for the route, which requires at least eight characters', () => {
    expect(newIdempotencyKey().length).toBeGreaterThanOrEqual(8)
  })

  it('does not repeat', () => {
    const keys = new Set(Array.from({ length: 200 }, () => newIdempotencyKey()))
    expect(keys.size).toBe(200)
  })
})
