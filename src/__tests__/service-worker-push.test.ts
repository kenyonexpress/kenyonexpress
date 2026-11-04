import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

/**
 * S21: the service worker's push subscription upkeep, run against the shipped
 * public/sw.js (same approach as service-worker.test.ts: the bytes that are
 * served, evaluated against a fake ServiceWorkerGlobalScope).
 *
 * The two moments it covers: a VAPID key rotation found on activate, and
 * `pushsubscriptionchange`. What must hold in both: the replacement is minted
 * against the key the server serves NOW, it is posted with the old endpoint,
 * and a refused post unsubscribes again rather than leaving a browser that
 * looks subscribed and can never receive anything.
 */

const SW_SOURCE = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8')
const ORIGIN = 'https://www.kenyonexpress.co.il'

function b64url(bytes: number[]): string {
  return Buffer.from(bytes).toString('base64url')
}
const OLD_KEY = Array.from({ length: 65 }, (_, i) => i)
const NEW_KEY = Array.from({ length: 65 }, (_, i) => 255 - i)

interface FakeSubscription {
  endpoint: string
  options: { applicationServerKey: ArrayBuffer }
  unsubscribe: ReturnType<typeof vi.fn>
  toJSON: () => unknown
}

function fakeSubscription(endpoint: string, key: number[]): FakeSubscription {
  return {
    endpoint,
    options: { applicationServerKey: new Uint8Array(key).buffer },
    unsubscribe: vi.fn(async () => true),
    toJSON: () => ({ endpoint, keys: { p256dh: 'p', auth: 'a' } }),
  }
}

function loadWorker(opts: {
  existing: FakeSubscription | null
  serverKey: number[] | null
  postStatus?: number
}) {
  const listeners = new Map<string, (event: unknown) => void>()
  const minted: FakeSubscription[] = []
  const subscribe = vi.fn(async (options: { applicationServerKey: Uint8Array }) => {
    const sub = fakeSubscription(
      `https://fcm.googleapis.com/fcm/send/new-${minted.length}`,
      Array.from(options.applicationServerKey),
    )
    minted.push(sub)
    return sub
  })
  const posts: Record<string, unknown>[] = []
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/push/subscription' && (!init || !init.method)) {
      return opts.serverKey
        ? new Response(JSON.stringify({ publicKey: b64url(opts.serverKey) }), { status: 200 })
        : new Response(JSON.stringify({ publicKey: null }), { status: 404 })
    }
    if (url === '/api/push/subscription' && init?.method === 'POST') {
      posts.push(JSON.parse(String(init.body)))
      return new Response('{}', { status: opts.postStatus ?? 200 })
    }
    throw new Error(`unexpected fetch ${url}`)
  })

  const self = {
    addEventListener: (type: string, listener: (event: unknown) => void) =>
      listeners.set(type, listener),
    skipWaiting: () => Promise.resolve(),
    clients: { claim: () => Promise.resolve(), matchAll: async () => [], openWindow: vi.fn() },
    location: new URL(`${ORIGIN}/sw.js`),
    registration: {
      showNotification: vi.fn(),
      pushManager: { getSubscription: async () => opts.existing, subscribe },
    },
  }
  const caches = { keys: async () => [], delete: async () => true }

  const run = new Function('self', 'caches', 'fetch', 'Response', 'Request', 'URL', SW_SOURCE)
  run(self, caches, fetchMock, Response, Request, URL)

  async function fire(type: string, extra: Record<string, unknown> = {}) {
    const waited: Promise<unknown>[] = []
    listeners.get(type)?.({ waitUntil: (p: Promise<unknown>) => waited.push(p), ...extra })
    await Promise.all(waited)
  }

  return { fire, subscribe, minted, posts, fetchMock }
}

describe('activate: VAPID key rotation', () => {
  it('re-subscribes against the new key and posts the old endpoint', async () => {
    const existing = fakeSubscription('https://fcm.googleapis.com/fcm/send/old', OLD_KEY)
    const worker = loadWorker({ existing, serverKey: NEW_KEY })

    await worker.fire('activate')

    expect(existing.unsubscribe).toHaveBeenCalled()
    expect(worker.subscribe).toHaveBeenCalledTimes(1)
    expect(Array.from(worker.subscribe.mock.calls[0]?.[0].applicationServerKey ?? [])).toEqual(
      NEW_KEY,
    )
    expect(worker.posts).toEqual([
      {
        endpoint: 'https://fcm.googleapis.com/fcm/send/new-0',
        keys: { p256dh: 'p', auth: 'a' },
        oldEndpoint: 'https://fcm.googleapis.com/fcm/send/old',
      },
    ])
  })

  it('leaves a subscription minted against the current key alone', async () => {
    const existing = fakeSubscription('https://fcm.googleapis.com/fcm/send/ok', NEW_KEY)
    const worker = loadWorker({ existing, serverKey: NEW_KEY })

    await worker.fire('activate')

    expect(existing.unsubscribe).not.toHaveBeenCalled()
    expect(worker.subscribe).not.toHaveBeenCalled()
    expect(worker.posts).toHaveLength(0)
  })

  it('does nothing for a browser that never subscribed', async () => {
    const worker = loadWorker({ existing: null, serverKey: NEW_KEY })
    await worker.fire('activate')
    expect(worker.fetchMock).not.toHaveBeenCalled()
  })

  it('does nothing when the server has no key, rather than unsubscribing', async () => {
    const existing = fakeSubscription('https://fcm.googleapis.com/fcm/send/old', OLD_KEY)
    const worker = loadWorker({ existing, serverKey: null })
    await worker.fire('activate')
    expect(existing.unsubscribe).not.toHaveBeenCalled()
  })

  it('unsubscribes the replacement when the server refuses it (signed out)', async () => {
    const existing = fakeSubscription('https://fcm.googleapis.com/fcm/send/old', OLD_KEY)
    const worker = loadWorker({ existing, serverKey: NEW_KEY, postStatus: 401 })

    await worker.fire('activate')

    expect(worker.minted[0]?.unsubscribe).toHaveBeenCalled()
  })
})

describe('pushsubscriptionchange', () => {
  it('posts the browser-supplied new subscription with the old endpoint', async () => {
    const worker = loadWorker({ existing: null, serverKey: NEW_KEY })
    const fresh = fakeSubscription('https://fcm.googleapis.com/fcm/send/fresh', NEW_KEY)

    await worker.fire('pushsubscriptionchange', {
      oldSubscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/expired' },
      newSubscription: fresh,
    })

    expect(worker.subscribe).not.toHaveBeenCalled()
    expect(worker.posts[0]).toMatchObject({
      endpoint: 'https://fcm.googleapis.com/fcm/send/fresh',
      oldEndpoint: 'https://fcm.googleapis.com/fcm/send/expired',
    })
  })

  it('subscribes itself with the server key when the event carries no new one', async () => {
    const worker = loadWorker({ existing: null, serverKey: NEW_KEY })

    await worker.fire('pushsubscriptionchange', {
      oldSubscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/expired' },
      newSubscription: null,
    })

    expect(worker.subscribe).toHaveBeenCalledTimes(1)
    expect(worker.posts[0]).toMatchObject({
      oldEndpoint: 'https://fcm.googleapis.com/fcm/send/expired',
    })
  })
})
