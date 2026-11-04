import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The route the service worker re-subscribes through (S21). What matters:
 * a cross-site or signed-out POST writes nothing, the new row is saved BEFORE
 * the old one is deleted, the old row's topics are carried over, and an
 * `oldEndpoint` is only ever deleted under the caller's own id.
 */

let user: { id: string } | null = { id: 'u-1' }
let sameOrigin = true
let allowed = true
const order: string[] = []

const upsert = vi.fn(async (_args: Record<string, unknown>) => {
  order.push('upsert')
  return { ok: true } as const
})
const readTopics = vi.fn(async (_u: string, _e: string) => ['expiry'] as const)
const remove = vi.fn(async (_u: string, _e: string) => {
  order.push('delete')
  return { ok: true } as const
})

vi.mock('@/lib/supabase/bearer', () => ({
  authenticateRequest: async () => (user ? { user, via: 'cookie' } : null),
}))
vi.mock('@/lib/security/same-origin', () => ({ isSameOriginRequest: () => sameOrigin }))
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: async () => ({ allowed }),
  rateLimitHeaders: () => ({}),
}))
vi.mock('@/lib/observability/with-request-log', () => ({
  withRequestLog: (_name: string, fn: unknown) => fn,
}))
vi.mock('@/lib/observability/log', () => ({ log: { warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/server/push/subscription-write', () => ({
  upsertPushSubscription: (args: Record<string, unknown>) => upsert(args),
  readPushTopics: (u: string, e: string) => readTopics(u, e),
  deletePushSubscription: (u: string, e: string) => remove(u, e),
}))

const { GET, POST } = await import('./route')

const NEW = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/new',
  keys: { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) },
}
const OLD = 'https://fcm.googleapis.com/fcm/send/old'

function get() {
  return new NextRequest('https://www.kenyonexpress.co.il/api/push/subscription')
}

function post(body: unknown) {
  return new NextRequest('https://www.kenyonexpress.co.il/api/push/subscription', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'sw-test' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  user = { id: 'u-1' }
  sameOrigin = true
  allowed = true
  order.length = 0
  upsert.mockClear()
  readTopics.mockClear()
  remove.mockClear()
  vi.unstubAllEnvs()
})

describe('GET /api/push/subscription', () => {
  it('serves the current public key, uncached', async () => {
    vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'BPub')
    const response = await GET(get())
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ publicKey: 'BPub' })
  })

  it('answers 404 with no key, so the worker repairs nothing', async () => {
    vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', '')
    expect((await GET(get())).status).toBe(404)
  })
})

describe('POST /api/push/subscription', () => {
  it('refuses a cross-site post and writes nothing', async () => {
    sameOrigin = false
    expect((await POST(post(NEW))).status).toBe(403)
    expect(upsert).not.toHaveBeenCalled()
  })

  it('refuses a signed-out worker, which makes it unsubscribe again', async () => {
    user = null
    expect((await POST(post(NEW))).status).toBe(401)
    expect(upsert).not.toHaveBeenCalled()
  })

  it('answers 429 when rate limited', async () => {
    allowed = false
    expect((await POST(post(NEW))).status).toBe(429)
    expect(upsert).not.toHaveBeenCalled()
  })

  it('saves a fresh subscription for the caller with default topics', async () => {
    const response = await POST(post(NEW))
    expect(response.status).toBe(200)
    expect(upsert).toHaveBeenCalledWith({
      userId: 'u-1',
      input: { endpoint: NEW.endpoint, keys: NEW.keys },
      userAgent: 'sw-test',
      topics: undefined,
    })
    expect(remove).not.toHaveBeenCalled()
  })

  it('on rotation, carries the old topics, saves first and deletes the old row second', async () => {
    const response = await POST(post({ ...NEW, oldEndpoint: OLD }))
    expect(response.status).toBe(200)
    expect(readTopics).toHaveBeenCalledWith('u-1', OLD)
    expect(upsert.mock.calls[0]?.[0]).toMatchObject({ topics: ['expiry'] })
    expect(remove).toHaveBeenCalledWith('u-1', OLD)
    expect(order).toEqual(['upsert', 'delete'])
  })

  it('keeps the old row when the save fails', async () => {
    upsert.mockResolvedValueOnce({ ok: false, reason: 'invalid', detail: 'p256dh' } as never)
    const response = await POST(post({ ...NEW, oldEndpoint: OLD }))
    expect(response.status).toBe(400)
    expect(remove).not.toHaveBeenCalled()
  })

  it('ignores an oldEndpoint that is not an https URL', async () => {
    await POST(post({ ...NEW, oldEndpoint: 'javascript:alert(1)' }))
    expect(readTopics).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()
  })

  it('answers 400 to a body that is not JSON', async () => {
    const request = new NextRequest('https://www.kenyonexpress.co.il/api/push/subscription', {
      method: 'POST',
      body: 'not json',
    })
    expect((await POST(request)).status).toBe(400)
  })
})
