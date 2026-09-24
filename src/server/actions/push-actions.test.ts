import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Web push subscriptions. What can only fail here: that the row is written
 * through the service role with the endpoint as the conflict key (the browser
 * owns the subscription, the latest account wins it), that the shape gate
 * refuses a forged payload before any write, that a database without 179
 * answers "not available yet" rather than crashing, and that the delete is
 * scoped to the caller so the service role never removes somebody else's row.
 */

type Result = { data: unknown; error: unknown }
type Call = { table: string; op: string; payload?: unknown; chain: [string, unknown[]][] }

const calls: Call[] = []
const queues = new Map<string, Result[]>()

function override(key: string, result: Result): void {
  queues.set(key, [result])
}

function settle(key: string): Result {
  const q = queues.get(key)
  if (!q || q.length === 0) return { data: null, error: null }
  return q.length === 1 ? (q[0] as Result) : (q.shift() as Result)
}

function builder(table: string, op: string, payload?: unknown): never {
  const record: Call = { table, op, payload, chain: [] }
  calls.push(record)
  const key = `${table}.${op}`
  const proxy: unknown = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') {
          return (resolve: (v: Result) => unknown, reject?: (e: unknown) => unknown) =>
            Promise.resolve(settle(key)).then(resolve, reject)
        }
        return (...args: unknown[]) => {
          record.chain.push([String(prop), args])
          if (prop === 'maybeSingle' || prop === 'single') return Promise.resolve(settle(key))
          return proxy
        }
      },
    },
  )
  return proxy as never
}

const adminClient = {
  from: (table: string) => ({
    upsert: (payload: unknown, options: unknown) => builder(table, 'upsert', { payload, options }),
    delete: () => builder(table, 'delete'),
  }),
}

const getUser = vi.fn()
const checkRateLimit = vi.fn()
const logWarn = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => adminClient }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: () => getUser() } }),
}))
vi.mock('@/lib/utils/rate-limit', () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
  getClientIp: async () => '203.0.113.9',
}))
vi.mock('next/headers', () => ({
  headers: async () => ({
    get: (name: string) => (name === 'user-agent' ? `Mozilla/5.0 ${'x'.repeat(300)}` : null),
  }),
}))
vi.mock('@/lib/observability/log', () => ({
  log: { warn: (...a: unknown[]) => logWarn(...a), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))
vi.mock('@/lib/observability/action-context', () => ({
  withActionContext: (_name: string, fn: () => unknown) => fn(),
}))

const USER_ID = '11111111-1111-4111-8111-111111111111'
const P256DH = 'B'.repeat(87)
const AUTH = 'a'.repeat(22)
const ENDPOINT = 'https://push.example/sub/1'
const NOT_AVAILABLE = 'התראות עדיין לא זמינות בחשבון הזה, נסו שוב בקרוב'
const BAD = 'שמירת ההתראות נכשלה, נסו שוב'

function subscription(overrides: Record<string, unknown> = {}) {
  return { endpoint: ENDPOINT, keys: { p256dh: P256DH, auth: AUTH }, ...overrides }
}

function find(table: string, op: string): Call | undefined {
  return calls.find((c) => c.table === table && c.op === op)
}

const { savePushSubscription, removePushSubscription } = await import('./push')

beforeEach(() => {
  calls.length = 0
  queues.clear()
  getUser.mockReset()
  getUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
  checkRateLimit.mockReset()
  checkRateLimit.mockResolvedValue(true)
  logWarn.mockReset()
})

describe('savePushSubscription', () => {
  it('upserts on the endpoint, through the service role, with the trimmed user agent', async () => {
    expect(await savePushSubscription(subscription() as never)).toEqual({ success: true })
    const upsert = find('push_subscriptions', 'upsert')
    const { payload, options } = upsert?.payload as {
      payload: Record<string, unknown>
      options: unknown
    }
    expect(payload).toMatchObject({
      endpoint: ENDPOINT,
      user_id: USER_ID,
      p256dh: P256DH,
      auth: AUTH,
    })
    expect((payload.user_agent as string).length).toBe(256)
    expect(options).toEqual({ onConflict: 'endpoint' })
    expect(checkRateLimit).toHaveBeenCalledWith('push-subscribe:203.0.113.9', 30, 3600)
  })

  it('refuses a signed-out or rate-limited caller before validation and writes', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    expect(await savePushSubscription(subscription() as never)).toEqual({
      error: 'צריך להתחבר כדי להפעיל התראות',
    })
    getUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    checkRateLimit.mockResolvedValue(false)
    expect(await savePushSubscription(subscription() as never)).toEqual({
      error: 'יותר מדי ניסיונות, נסו שוב בעוד שעה',
    })
    expect(calls).toEqual([])
  })

  it('refuses every malformed shape with one sentence and logs the real reason', async () => {
    const cases: [unknown, string][] = [
      [{ endpoint: ENDPOINT }, 'shape'],
      [{ endpoint: ENDPOINT, keys: { p256dh: P256DH, auth: 5 } }, 'shape'],
      [subscription({ endpoint: 'http://push.example/1' }), 'endpoint'],
      [subscription({ endpoint: `https://x/${'a'.repeat(2000)}` }), 'endpoint'],
      [subscription({ keys: { p256dh: 'B'.repeat(86), auth: AUTH } }), 'p256dh'],
      [subscription({ keys: { p256dh: `${'B'.repeat(86)}+`, auth: AUTH } }), 'p256dh'],
      [subscription({ keys: { p256dh: P256DH, auth: 'a'.repeat(21) } }), 'auth'],
      [subscription({ keys: { p256dh: P256DH, auth: `${'a'.repeat(21)}/` } }), 'auth'],
    ]
    for (const [input, reason] of cases) {
      logWarn.mockReset()
      expect(await savePushSubscription(input as never)).toEqual({ error: BAD })
      expect(logWarn).toHaveBeenCalledWith('push.subscribe_rejected', { reason })
    }
    expect(calls).toEqual([])
  })

  it('answers "not available yet" on a database without 179', async () => {
    override('push_subscriptions.upsert', { data: null, error: { code: '42P01', message: 'x' } })
    expect(await savePushSubscription(subscription() as never)).toEqual({ error: NOT_AVAILABLE })
    override('push_subscriptions.upsert', {
      data: null,
      error: { message: 'relation "push_subscriptions" does not exist' },
    })
    expect(await savePushSubscription(subscription() as never)).toEqual({ error: NOT_AVAILABLE })
  })

  it('reports any other write failure with the generic sentence and logs it', async () => {
    override('push_subscriptions.upsert', { data: null, error: { code: '23514', message: 'chk' } })
    expect(await savePushSubscription(subscription() as never)).toEqual({ error: BAD })
    expect(logWarn).toHaveBeenCalledWith('push.subscribe_failed', { reason: 'chk' })
  })
})

describe('removePushSubscription', () => {
  it('deletes the row scoped to both the endpoint and the caller', async () => {
    expect(await removePushSubscription(ENDPOINT)).toEqual({ success: true })
    const del = find('push_subscriptions', 'delete')
    expect(del?.chain).toContainEqual(['eq', ['endpoint', ENDPOINT]])
    expect(del?.chain).toContainEqual(['eq', ['user_id', USER_ID]])
  })

  it('refuses a signed-out caller and an oversized endpoint before any write', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    expect(await removePushSubscription(ENDPOINT)).toEqual({
      error: 'צריך להתחבר כדי להפעיל התראות',
    })
    getUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    expect(await removePushSubscription('x'.repeat(2001))).toEqual({ error: BAD })
    expect(logWarn).toHaveBeenCalledWith('push.unsubscribe_rejected', { reason: 'endpoint' })
    expect(calls).toEqual([])
  })

  it('answers "not available yet" without 179, and the generic line otherwise', async () => {
    override('push_subscriptions.delete', { data: null, error: { code: 'PGRST205', message: '' } })
    expect(await removePushSubscription(ENDPOINT)).toEqual({ error: NOT_AVAILABLE })
    override('push_subscriptions.delete', { data: null, error: { code: '57014', message: 'to' } })
    expect(await removePushSubscription(ENDPOINT)).toEqual({ error: BAD })
    expect(logWarn).toHaveBeenCalledWith('push.unsubscribe_failed', { reason: 'to' })
  })
})
