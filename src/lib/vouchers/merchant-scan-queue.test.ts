import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DRAIN_BATCH_LIMIT,
  MERCHANT_SCAN_QUEUE_KEY,
  type QueueStore,
  type QueuedScan,
  clearQueue,
  clearSettled,
  drainQueue,
  enqueueScan,
  newIdempotencyKey,
  readQueue,
  submitScan,
} from './merchant-scan-queue'

/**
 * The web till's queue, without a browser. What is locked here is the pair of
 * rules that make an offline queue safe: a scan is queued under the SAME key
 * the first request carried, and only the keys the server settled are dropped.
 */

function memoryStore(): QueueStore & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      data.set(k, v)
    },
    removeItem: (k) => {
      data.delete(k)
    },
  }
}

function scan(key: string, extra: Partial<QueuedScan> = {}): QueuedScan {
  return {
    idempotencyKey: key,
    code: 'ABCDE12345',
    scanMethod: 'manual',
    scannedAt: '2026-10-01T09:00:00.000Z',
    label: 'ABCDE-12345',
    ...extra,
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  } as unknown as Response
}

let store: ReturnType<typeof memoryStore>

beforeEach(() => {
  store = memoryStore()
})

describe('the queue on disk', () => {
  it('is FIFO and de-duplicates a double tap on the same key', () => {
    enqueueScan(store, scan('scan-aaaaaaaa'))
    enqueueScan(store, scan('scan-bbbbbbbb'))
    enqueueScan(store, scan('scan-aaaaaaaa'))
    expect(readQueue(store).map((s) => s.idempotencyKey)).toEqual([
      'scan-aaaaaaaa',
      'scan-bbbbbbbb',
    ])
  })

  it('survives a corrupt or foreign value rather than bricking the till', () => {
    store.setItem(MERCHANT_SCAN_QUEUE_KEY, '{not json')
    expect(readQueue(store)).toEqual([])
    store.setItem(MERCHANT_SCAN_QUEUE_KEY, JSON.stringify([{ idempotencyKey: 'x' }, 7, null]))
    expect(readQueue(store)).toEqual([])
  })

  it('drops exactly the settled keys and nothing else', () => {
    enqueueScan(store, scan('scan-aaaaaaaa'))
    enqueueScan(store, scan('scan-bbbbbbbb'))
    enqueueScan(store, scan('scan-cccccccc'))
    const left = clearSettled(store, ['scan-bbbbbbbb', 'scan-not-there'])
    expect(left.map((s) => s.idempotencyKey)).toEqual(['scan-aaaaaaaa', 'scan-cccccccc'])
    expect(readQueue(store)).toHaveLength(2)
  })

  it('clears on demand, for sign-out', () => {
    enqueueScan(store, scan('scan-aaaaaaaa'))
    clearQueue(store)
    expect(store.data.has(MERCHANT_SCAN_QUEUE_KEY)).toBe(false)
    expect(readQueue(store)).toEqual([])
  })

  it('mints keys the batch route accepts, and never the same one twice', () => {
    const keys = new Set(Array.from({ length: 200 }, () => newIdempotencyKey()))
    expect(keys.size).toBe(200)
    for (const key of keys) expect(key.length).toBeGreaterThanOrEqual(8)
  })
})

describe('submitScan', () => {
  it('returns the server verdict and queues nothing when the request answers', async () => {
    const fetch = vi.fn(async () =>
      jsonResponse({
        outcome: 'success',
        message: 'השובר מומש בהצלחה',
        voucher: { code: 'ABCDE12345', remaining_amount_due_agorot: 30000 },
      }),
    )
    const result = await submitScan(
      { store, fetch },
      { code: 'ABCDE12345', scanMethod: 'manual', label: 'x' },
    )
    expect(result.kind).toBe('settled')
    if (result.kind === 'settled') {
      expect(result.outcome).toBe('success')
      expect(result.voucher?.remaining_amount_due_agorot).toBe(30000)
    }
    expect(readQueue(store)).toEqual([])
    // The key travelled with the FIRST request, so a retry can replay it.
    const body = JSON.parse(
      (fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string,
    )
    expect(body.idempotency_key).toMatch(/^scan-/)
    expect(body.scan_method).toBe('manual')
  })

  it('treats a refusal as a verdict: already_redeemed is settled, not queued', async () => {
    const fetch = vi.fn(async () =>
      jsonResponse({ outcome: 'already_redeemed', message: 'השובר כבר מומש' }, 409),
    )
    const result = await submitScan(
      { store, fetch },
      { code: 'ABCDE12345', scanMethod: 'manual', label: 'x' },
    )
    expect(result.kind).toBe('settled')
    expect(readQueue(store)).toEqual([])
  })

  it('queues under the same key when the network never answers', async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    const result = await submitScan(
      { store, fetch, now: () => new Date('2026-10-01T09:00:00Z') },
      { qrPayload: 'KEV1.body.sig', scanMethod: 'camera', label: 'QR' },
    )
    expect(result.kind).toBe('queued')
    const sent = JSON.parse(
      (fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string,
    )
    const queued = readQueue(store)
    expect(queued).toHaveLength(1)
    expect(queued[0]?.idempotencyKey).toBe(sent.idempotency_key)
    expect(queued[0]?.qrPayload).toBe('KEV1.body.sig')
    expect(queued[0]?.scanMethod).toBe('camera')
    expect(queued[0]?.scannedAt).toBe('2026-10-01T09:00:00.000Z')
  })

  it('queues a 5xx and a 429: the server decided nothing about the voucher', async () => {
    for (const status of [500, 503, 429]) {
      const s = memoryStore()
      const fetch = vi.fn(async () => jsonResponse({ outcome: 'invalid_request' }, status))
      const result = await submitScan(
        { store: s, fetch },
        { code: 'ABCDE12345', scanMethod: 'manual', label: 'x' },
      )
      expect(result.kind, String(status)).toBe('queued')
      expect(readQueue(s)).toHaveLength(1)
    }
  })

  it('does not queue a 401: a signed-out device must not hold scans it cannot send', async () => {
    const fetch = vi.fn(async () =>
      jsonResponse({ outcome: 'unauthorized', message: 'אין הרשאת ספק' }, 401),
    )
    const result = await submitScan(
      { store, fetch },
      { code: 'ABCDE12345', scanMethod: 'manual', label: 'x' },
    )
    expect(result).toMatchObject({ kind: 'settled', outcome: 'unauthorized' })
    expect(readQueue(store)).toEqual([])
  })

  it('reuses a caller-supplied key so a retried scan replays instead of repeating', async () => {
    const fetch = vi.fn(async () =>
      jsonResponse({ outcome: 'success', message: 'ok', replayed: true }),
    )
    const result = await submitScan(
      { store, fetch },
      { code: 'ABCDE12345', scanMethod: 'manual', label: 'x', idempotencyKey: 'scan-fixed-key' },
    )
    const sent = JSON.parse(
      (fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string,
    )
    expect(sent.idempotency_key).toBe('scan-fixed-key')
    expect(result).toMatchObject({ kind: 'settled', replayed: true })
  })
})

describe('drainQueue', () => {
  it('is a no-op on an empty queue and never calls the network', async () => {
    const fetch = vi.fn()
    expect(await drainQueue({ store, fetch })).toEqual({ kind: 'empty' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('sends the queue in order and drops only what the server settled', async () => {
    enqueueScan(store, scan('scan-aaaaaaaa'))
    enqueueScan(
      store,
      scan('scan-bbbbbbbb', { code: undefined, qrPayload: 'KEV1.x.y', scanMethod: 'camera' }),
    )
    enqueueScan(store, scan('scan-cccccccc'))
    const fetch = vi.fn(async () =>
      jsonResponse({
        ok: true,
        results: [
          {
            idempotency_key: 'scan-aaaaaaaa',
            outcome: 'success',
            replayed: false,
            code: 'ABCDE12345',
            message: 'מומש',
          },
          {
            idempotency_key: 'scan-bbbbbbbb',
            outcome: 'error',
            replayed: false,
            code: null,
            message: 'שגיאה',
          },
          {
            idempotency_key: 'scan-cccccccc',
            outcome: 'expired',
            replayed: false,
            code: 'ABCDE12345',
            message: 'פג תוקף',
          },
        ],
        settled: ['scan-aaaaaaaa', 'scan-cccccccc'],
      }),
    )
    const result = await drainQueue({ store, fetch })
    expect(result).toMatchObject({ kind: 'drained', attempted: 3, stillPending: 1 })
    expect(readQueue(store).map((s) => s.idempotencyKey)).toEqual(['scan-bbbbbbbb'])

    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/supplier/vouchers/redeem-batch')
    const body = JSON.parse(init.body as string)
    expect(body.items.map((i: { idempotency_key: string }) => i.idempotency_key)).toEqual([
      'scan-aaaaaaaa',
      'scan-bbbbbbbb',
      'scan-cccccccc',
    ])
    expect(body.items[1]).toMatchObject({ qr_payload: 'KEV1.x.y', scan_method: 'camera' })
    expect(body.items[0].scanned_at).toBe('2026-10-01T09:00:00.000Z')
  })

  it('applies the settled rule itself when the server omits the list', async () => {
    enqueueScan(store, scan('scan-aaaaaaaa'))
    enqueueScan(store, scan('scan-bbbbbbbb'))
    const fetch = vi.fn(async () =>
      jsonResponse({
        ok: true,
        results: [
          {
            idempotency_key: 'scan-aaaaaaaa',
            outcome: 'not_found',
            replayed: false,
            code: null,
            message: null,
          },
          {
            idempotency_key: 'scan-bbbbbbbb',
            outcome: 'rate_limited',
            replayed: false,
            code: null,
            message: null,
          },
        ],
      }),
    )
    await drainQueue({ store, fetch })
    expect(readQueue(store).map((s) => s.idempotencyKey)).toEqual(['scan-bbbbbbbb'])
  })

  it('sends at most the batch limit and leaves the rest for the next call', async () => {
    for (let i = 0; i < DRAIN_BATCH_LIMIT + 5; i++)
      enqueueScan(store, scan(`scan-${String(i).padStart(8, '0')}`))
    const fetch = vi.fn(async (_url: string, init: RequestInit) => {
      const items = JSON.parse(init.body as string).items as { idempotency_key: string }[]
      return jsonResponse({
        ok: true,
        results: items.map((i) => ({
          idempotency_key: i.idempotency_key,
          outcome: 'success',
          replayed: false,
          code: null,
          message: null,
        })),
        settled: items.map((i) => i.idempotency_key),
      })
    })
    const result = await drainQueue({ store, fetch })
    expect(result).toMatchObject({ kind: 'drained', attempted: DRAIN_BATCH_LIMIT, stillPending: 5 })
  })

  it.each([
    ['offline', () => Promise.reject(new TypeError('Failed to fetch')), 'offline'],
    [
      'a 401',
      () => Promise.resolve(jsonResponse({ ok: false, error: 'unauthorized' }, 401)),
      'unauthorized',
    ],
    [
      'a 429',
      () => Promise.resolve(jsonResponse({ ok: false, error: 'rate_limited', settled: [] }, 429)),
      'rate_limited',
    ],
    ['a 500', () => Promise.resolve(jsonResponse({ ok: false }, 500)), 'failed'],
    [
      'a 200 without ok',
      () => Promise.resolve(jsonResponse({ results: [], settled: ['scan-aaaaaaaa'] }, 200)),
      'failed',
    ],
  ])('keeps every item on %s', async (_label, fetchImpl, kind) => {
    enqueueScan(store, scan('scan-aaaaaaaa'))
    const result = await drainQueue({ store, fetch: vi.fn(fetchImpl) })
    expect(result.kind).toBe(kind)
    expect(readQueue(store)).toHaveLength(1)
  })
})
