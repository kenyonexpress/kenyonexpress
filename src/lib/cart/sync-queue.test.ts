import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  type FakeIndexedDB,
  installFakeIndexedDB,
  uninstallFakeIndexedDB,
} from '../../../test/fake-indexeddb'
import {
  CART_SYNCED_MESSAGE,
  CART_SYNC_DB,
  CART_SYNC_ENDPOINT,
  CART_SYNC_FAILED_MESSAGE,
  CART_SYNC_MAX_LINES,
  CART_SYNC_STORE,
  CART_SYNC_TAG,
  cartLineKey,
  clearCartSyncQueue,
  dropCartSyncQueue,
  flushCartSyncQueue,
  isNetworkFailure,
  queueCartLine,
  readCartSyncQueue,
  requestBackgroundCartSync,
} from './sync-queue'

/**
 * The offline cart queue, against an in-memory IndexedDB.
 *
 * The property that matters is in the first block: an entry is an ABSOLUTE
 * quantity and the queue holds one per line, so a replay that runs twice (a
 * lost response, a page and a worker both firing on `online`) cannot double
 * an order. The last block pins the names the service worker hard-codes to
 * the ones exported here, because `public/sw.js` cannot import this module
 * and a renamed store would make the worker replay an empty queue forever.
 */

const P1 = '11111111-1111-4111-8111-111111111111'
const P2 = '22222222-2222-4222-8222-222222222222'

let idb: FakeIndexedDB

beforeEach(() => {
  idb = installFakeIndexedDB()
})

afterEach(() => {
  uninstallFakeIndexedDB()
  vi.unstubAllGlobals()
})

describe('the queue holds one absolute quantity per line', () => {
  it('stores the quantity the line should end at, keyed by product and variant', async () => {
    expect(await queueCartLine(P1, null, 2, 1000)).toBe(true)
    expect(await readCartSyncQueue()).toEqual([
      { key: cartLineKey(P1, null), product_id: P1, variant_id: null, quantity: 2, at: 1000 },
    ])
  })

  it('replaces an earlier entry for the same line instead of appending', async () => {
    await queueCartLine(P1, null, 2, 1000)
    await queueCartLine(P1, null, 5, 2000)
    const queue = await readCartSyncQueue()
    expect(queue).toHaveLength(1)
    expect(queue[0]?.quantity).toBe(5)
  })

  it('treats a variant as its own line', async () => {
    await queueCartLine(P1, null, 1, 1000)
    await queueCartLine(P1, P2, 1, 1001)
    expect(await readCartSyncQueue()).toHaveLength(2)
  })

  it('reads back in write order', async () => {
    await queueCartLine(P2, null, 1, 2000)
    await queueCartLine(P1, null, 1, 1000)
    expect((await readCartSyncQueue()).map((l) => l.product_id)).toEqual([P1, P2])
  })

  it('clears only the entries that were sent, keeping a newer write to the same line', async () => {
    await queueCartLine(P1, null, 2, 1000)
    await queueCartLine(P2, null, 1, 1000)
    const sent = await readCartSyncQueue()
    // The shopper changed P1 again while the replay was in flight.
    await queueCartLine(P1, null, 7, 3000)
    await clearCartSyncQueue(sent)
    const left = await readCartSyncQueue()
    expect(left).toHaveLength(1)
    expect(left[0]).toMatchObject({ product_id: P1, quantity: 7 })
  })

  it('drops everything on request', async () => {
    await queueCartLine(P1, null, 2)
    await dropCartSyncQueue()
    expect(await readCartSyncQueue()).toEqual([])
  })

  it('is a no-op, not a throw, where IndexedDB refuses to open', async () => {
    idb.refuse = true
    expect(await queueCartLine(P1, null, 2)).toBe(false)
    expect(await readCartSyncQueue()).toEqual([])
    await expect(clearCartSyncQueue([])).resolves.toBeUndefined()
  })

  it('is a no-op where there is no IndexedDB at all', async () => {
    uninstallFakeIndexedDB()
    expect(await queueCartLine(P1, null, 2)).toBe(false)
    expect(await readCartSyncQueue()).toEqual([])
  })
})

describe('isNetworkFailure', () => {
  it('is true for the TypeError fetch rejects with when the origin is unreachable', () => {
    expect(isNetworkFailure(new TypeError('Failed to fetch'))).toBe(true)
  })

  it('is false for an ordinary thrown action: the server answered, and will again', () => {
    expect(isNetworkFailure(new Error('boom'))).toBe(false)
    expect(isNetworkFailure('string')).toBe(false)
  })

  it('is true for anything when the browser reports offline', () => {
    vi.stubGlobal('navigator', { ...navigator, onLine: false })
    expect(isNetworkFailure(new Error('boom'))).toBe(true)
  })
})

describe('requestBackgroundCartSync', () => {
  it('answers false where the browser has no service worker (so the page replays itself)', async () => {
    vi.stubGlobal('navigator', { onLine: true })
    expect(await requestBackgroundCartSync()).toBe(false)
  })

  it('answers false where the registration has no SyncManager: every WebKit browser', async () => {
    vi.stubGlobal('navigator', { serviceWorker: { ready: Promise.resolve({}) } })
    expect(await requestBackgroundCartSync()).toBe(false)
  })

  it('registers the cart tag and answers true where Background Sync exists', async () => {
    const register = vi.fn(async () => undefined)
    vi.stubGlobal('navigator', {
      serviceWorker: { ready: Promise.resolve({ sync: { register } }) },
    })
    expect(await requestBackgroundCartSync()).toBe(true)
    expect(register).toHaveBeenCalledWith(CART_SYNC_TAG)
  })

  it('answers false when registration is refused (a site setting), never throws', async () => {
    vi.stubGlobal('navigator', {
      serviceWorker: {
        ready: Promise.resolve({
          sync: {
            register: async () => {
              throw new Error('NotAllowedError')
            },
          },
        }),
      },
    })
    expect(await requestBackgroundCartSync()).toBe(false)
  })
})

describe('flushCartSyncQueue: the page-side replay', () => {
  const cart = { id: 'c1', items: [], item_count: 0 }

  function fetchAnswering(status: number, body: unknown = { ok: true, cart, rejected: [] }) {
    return vi.fn(
      async () =>
        new Response(JSON.stringify(body), {
          status,
          headers: { 'content-type': 'application/json' },
        }),
    )
  }

  it('does nothing with an empty queue', async () => {
    const fetchImpl = fetchAnswering(200)
    expect(await flushCartSyncQueue(fetchImpl)).toEqual({ kind: 'empty' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('posts the lines without their bookkeeping, with the cookies, and clears them on 200', async () => {
    await queueCartLine(P1, null, 3, 1000)
    const fetchImpl = fetchAnswering(200)

    const outcome = await flushCartSyncQueue(fetchImpl)

    expect(outcome).toEqual({ kind: 'synced', result: { ok: true, cart, rejected: [] } })
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(CART_SYNC_ENDPOINT)
    expect(init.method).toBe('POST')
    expect(init.credentials).toBe('same-origin')
    expect(JSON.parse(init.body as string)).toEqual({
      lines: [{ product_id: P1, variant_id: null, quantity: 3 }],
    })
    expect(await readCartSyncQueue()).toEqual([])
  })

  it('keeps the queue on a network error, for the next online', async () => {
    await queueCartLine(P1, null, 3)
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    expect(await flushCartSyncQueue(fetchImpl)).toEqual({ kind: 'retry' })
    expect(await readCartSyncQueue()).toHaveLength(1)
  })

  it('keeps the queue on a 5xx: the server will be back', async () => {
    await queueCartLine(P1, null, 3)
    expect(await flushCartSyncQueue(fetchAnswering(503, { ok: false }))).toEqual({ kind: 'retry' })
    expect(await readCartSyncQueue()).toHaveLength(1)
  })

  it('drops the queue on a 4xx: a refusal on the merits does not improve with age', async () => {
    await queueCartLine(P1, null, 3)
    expect(await flushCartSyncQueue(fetchAnswering(403, { ok: false }))).toEqual({
      kind: 'refused',
      status: 403,
    })
    expect(await readCartSyncQueue()).toEqual([])
  })

  it('sends at most the route ceiling in one replay', async () => {
    for (let i = 0; i < CART_SYNC_MAX_LINES + 5; i++) {
      await queueCartLine(`${String(i).padStart(8, '0')}-0000-4000-8000-000000000000`, null, 1, i)
    }
    const fetchImpl = fetchAnswering(200)
    await flushCartSyncQueue(fetchImpl)
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(init.body as string).lines).toHaveLength(CART_SYNC_MAX_LINES)
    // The overflow stays for the next replay.
    expect(await readCartSyncQueue()).toHaveLength(5)
  })
})

describe('public/sw.js speaks the same names', () => {
  const sw = readFileSync('public/sw.js', 'utf8')

  it.each([
    ['CART_SYNC_DB', CART_SYNC_DB],
    ['CART_SYNC_STORE', CART_SYNC_STORE],
    ['CART_SYNC_TAG', CART_SYNC_TAG],
    ['CART_SYNC_ENDPOINT', CART_SYNC_ENDPOINT],
    ['CART_SYNCED_MESSAGE', CART_SYNCED_MESSAGE],
    ['CART_SYNC_FAILED_MESSAGE', CART_SYNC_FAILED_MESSAGE],
  ])('%s', (name, value) => {
    expect(sw).toContain(`const ${name} = '${value}'`)
  })

  it('CART_SYNC_MAX_LINES', () => {
    expect(sw).toContain(`const CART_SYNC_MAX_LINES = ${CART_SYNC_MAX_LINES}`)
  })

  it('keys the store the way this module does', () => {
    expect(sw).toContain("createObjectStore(CART_SYNC_STORE, { keyPath: 'key' })")
  })
})
