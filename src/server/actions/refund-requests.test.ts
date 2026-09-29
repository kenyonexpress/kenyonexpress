import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The customer's side of a refund request, driven through a fake Supabase
 * admin client — same builder shape as `payments/refund.test.ts` — so every
 * branch (auth, validation, rate limit, ownership, the cap trigger, the
 * missing-202 fallback) is reachable without a real database.
 */

type Result = { data: unknown; error: unknown }
type Call = { table: string; op: string; payload?: unknown; chain: [string, unknown[]][] }

const calls: Call[] = []
const queues = new Map<string, Result[]>()

function queue(key: string, ...results: Result[]): void {
  queues.set(key, [...(queues.get(key) ?? []), ...results])
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
    select: (...args: unknown[]) => builder(table, 'select', args[0]),
    insert: (payload: unknown) => builder(table, 'insert', payload),
  }),
}

const getUser = vi.fn()
const checkRateLimit = vi.fn()
const revalidatePath = vi.fn()
const logError = vi.fn()
const logWarn = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: () => getUser() } }),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => adminClient }))
vi.mock('@/lib/utils/rate-limit', () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
}))
vi.mock('next/cache', () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args) }))
vi.mock('@/lib/observability/action-context', () => ({
  withActionContext: async <T>(_name: string, fn: () => Promise<T>) => fn(),
}))
vi.mock('@/lib/observability/log', () => ({
  log: {
    error: (...args: unknown[]) => logError(...args),
    warn: (...args: unknown[]) => logWarn(...args),
  },
}))

import { refundRequestStatus, requestRefund } from './refund-requests'

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [key, value] of Object.entries(fields)) fd.set(key, value)
  return fd
}

const ORDER_ID = '123e4567-e89b-12d3-a456-426614174000'
const VALID_FIELDS = {
  order_id: ORDER_ID,
  reason_code: 'defective',
  reason_text: 'המוצר הגיע פגום ולא ניתן להשתמש בו',
}

function ownedOrder(overrides: Partial<{ status: string; paid_at: string | null }> = {}) {
  return {
    data: {
      id: ORDER_ID,
      status: overrides.status ?? 'paid',
      paid_at: overrides.paid_at ?? null,
      user_id: 'user-1',
    },
    error: null,
  }
}

beforeEach(() => {
  calls.length = 0
  queues.clear()
  getUser.mockReset().mockResolvedValue({ data: { user: { id: 'user-1' } } })
  checkRateLimit.mockReset().mockResolvedValue(true)
  revalidatePath.mockReset()
  logError.mockReset()
  logWarn.mockReset()
})

describe('requestRefund', () => {
  it('refuses when nobody is signed in', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const result = await requestRefund({ ok: false }, formData(VALID_FIELDS))
    expect(result).toMatchObject({ ok: false, error: 'יש להתחבר כדי לבקש החזר' })
  })

  it('refuses invalid input with the zod message', async () => {
    const result = await requestRefund(
      { ok: false },
      formData({ ...VALID_FIELDS, reason_text: 'קצר' }),
    )
    expect(result).toMatchObject({ ok: false, error: 'נא לפרט לפחות 10 תווים' })
  })

  it('refuses over the rate limit', async () => {
    checkRateLimit.mockResolvedValue(false)
    const result = await requestRefund({ ok: false }, formData(VALID_FIELDS))
    expect(result).toMatchObject({ ok: false, error: 'יותר מדי בקשות. נסו שוב מאוחר יותר.' })
  })

  it('reports a generic error when the order read fails', async () => {
    queue('orders.select', { data: null, error: { message: 'boom' } })
    const result = await requestRefund({ ok: false }, formData(VALID_FIELDS))
    expect(result).toMatchObject({ ok: false, error: 'לא ניתן לטעון את ההזמנה כרגע, נסו שוב' })
    expect(logError).toHaveBeenCalledWith(
      'refund_request.order_read_failed',
      expect.objectContaining({ userId: 'user-1' }),
    )
  })

  it('answers "not found" when the order does not exist', async () => {
    queue('orders.select', { data: null, error: null })
    const result = await requestRefund({ ok: false }, formData(VALID_FIELDS))
    expect(result).toMatchObject({ ok: false, error: 'ההזמנה לא נמצאה' })
  })

  it("answers the same not-found for an order that is not the caller's", async () => {
    queue('orders.select', {
      data: { id: ORDER_ID, status: 'paid', paid_at: null, user_id: 'someone-else' },
      error: null,
    })
    const result = await requestRefund({ ok: false }, formData(VALID_FIELDS))
    expect(result).toMatchObject({ ok: false, error: 'ההזמנה לא נמצאה' })
  })

  it('reports the decision refusal message when the request may not be recorded', async () => {
    queue('orders.select', ownedOrder({ status: 'pending' }))
    const result = await requestRefund({ ok: false }, formData(VALID_FIELDS))
    expect(result).toMatchObject({
      ok: false,
      error: 'אפשר לבקש החזר רק על הזמנה ששולמה.',
      remaining: 3,
    })
  })

  it('reports the cap message when the insert trigger raises a check violation', async () => {
    queue('orders.select', ownedOrder())
    queue('refund_requests.insert', { data: null, error: { code: '23514', message: 'cap' } })
    const result = await requestRefund({ ok: false }, formData(VALID_FIELDS))
    expect(result.ok).toBe(false)
    expect(result.remaining).toBe(0)
    expect(result.error).toContain('3')
  })

  it('reports the table-not-active message on a missing relation', async () => {
    queue('orders.select', ownedOrder())
    queue('refund_requests.insert', { data: null, error: { code: '42P01', message: 'missing' } })
    const result = await requestRefund({ ok: false }, formData(VALID_FIELDS))
    expect(result).toMatchObject({
      ok: false,
      error: 'טופס בקשות ההחזר עדיין לא פעיל. פנו אלינו ונטפל בזה.',
    })
    expect(logError).toHaveBeenCalledWith('refund_request.table_missing', expect.any(Object))
  })

  it('reports a generic save failure for any other insert error', async () => {
    queue('orders.select', ownedOrder())
    queue('refund_requests.insert', {
      data: null,
      error: { code: '99999', message: 'db exploded' },
    })
    const result = await requestRefund({ ok: false }, formData(VALID_FIELDS))
    expect(result).toMatchObject({ ok: false, error: 'שמירת הבקשה נכשלה, נסו שוב' })
    expect(logError).toHaveBeenCalledWith('refund_request.insert_failed', expect.any(Object))
  })

  it('records the request and reports how many asks remain', async () => {
    queue('orders.select', ownedOrder())
    queue('refund_requests.insert', { data: null, error: null })
    const result = await requestRefund({ ok: false }, formData(VALID_FIELDS))
    expect(result).toMatchObject({ ok: true, remaining: 2 })
    expect(revalidatePath).toHaveBeenCalledWith(`/account/orders/${ORDER_ID}`)
  })

  it('warns but still proceeds on a readable-but-failing existing-requests read', async () => {
    queue('orders.select', ownedOrder())
    queue('refund_requests.select', { data: null, error: { code: '99999', message: 'read boom' } })
    queue('refund_requests.insert', { data: null, error: null })
    const result = await requestRefund({ ok: false }, formData(VALID_FIELDS))
    expect(result.ok).toBe(true)
    expect(logWarn).toHaveBeenCalledWith('refund_request.read_failed', expect.any(Object))
  })

  it('does not warn when the existing-requests table itself is not applied yet', async () => {
    queue('orders.select', ownedOrder())
    queue('refund_requests.select', { data: null, error: { code: '42P01', message: 'missing' } })
    queue('refund_requests.insert', { data: null, error: { code: '42P01', message: 'missing' } })
    const result = await requestRefund({ ok: false }, formData(VALID_FIELDS))
    expect(result).toMatchObject({
      ok: false,
      error: 'טופס בקשות ההחזר עדיין לא פעיל. פנו אלינו ונטפל בזה.',
    })
    expect(logWarn).not.toHaveBeenCalled()
  })

  it('treats an insert error with no code at all as a generic save failure', async () => {
    queue('orders.select', ownedOrder())
    queue('refund_requests.insert', { data: null, error: { message: 'no code on this one' } })
    const result = await requestRefund({ ok: false }, formData(VALID_FIELDS))
    expect(result).toMatchObject({ ok: false, error: 'שמירת הבקשה נכשלה, נסו שוב' })
  })

  it('warns on an existing-requests read error that carries no code', async () => {
    queue('orders.select', ownedOrder())
    queue('refund_requests.select', { data: null, error: { message: 'no code on this one' } })
    queue('refund_requests.insert', { data: null, error: null })
    const result = await requestRefund({ ok: false }, formData(VALID_FIELDS))
    expect(result.ok).toBe(true)
    expect(logWarn).toHaveBeenCalledWith('refund_request.read_failed', expect.any(Object))
  })
})

describe('refundRequestStatus', () => {
  it('answers the signed-out default with the full cap remaining', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const result = await refundRequestStatus(ORDER_ID)
    expect(result).toMatchObject({ allowed: false, message: null, remaining: 3, requests: [] })
  })

  it('reports a friendly message when the order read for status fails', async () => {
    queue('orders.select', { data: null, error: { message: 'boom' } })
    const result = await refundRequestStatus(ORDER_ID)
    expect(result).toMatchObject({
      allowed: false,
      message: 'לא ניתן לטעון את מצב הבקשות כרגע. נסו לרענן.',
      remaining: 3,
      requests: [],
    })
    expect(logWarn).toHaveBeenCalledWith(
      'refund_request.status_order_read_failed',
      expect.any(Object),
    )
  })

  it('answers the not-mine default for an order that does not belong to the caller', async () => {
    queue('orders.select', {
      data: { id: ORDER_ID, status: 'paid', paid_at: null, user_id: 'someone-else' },
      error: null,
    })
    const result = await refundRequestStatus(ORDER_ID)
    expect(result).toMatchObject({ allowed: false, message: null, remaining: 3, requests: [] })
  })

  it('warns but still answers when the requests read fails for a reason other than a missing table', async () => {
    queue('orders.select', ownedOrder())
    queue('refund_requests.select', { data: null, error: { code: '99999', message: 'read boom' } })
    const result = await refundRequestStatus(ORDER_ID)
    expect(result.allowed).toBe(true)
    expect(logWarn).toHaveBeenCalledWith('refund_request.status_read_failed', expect.any(Object))
  })

  it('does not warn when the requests table itself is not applied yet', async () => {
    queue('orders.select', ownedOrder())
    queue('refund_requests.select', { data: null, error: { code: '42P01', message: 'missing' } })
    const result = await refundRequestStatus(ORDER_ID)
    expect(result.allowed).toBe(true)
    expect(logWarn).not.toHaveBeenCalled()
  })

  it('warns on a status requests-read error that carries no code', async () => {
    queue('orders.select', ownedOrder())
    queue('refund_requests.select', { data: null, error: { message: 'no code on this one' } })
    const result = await refundRequestStatus(ORDER_ID)
    expect(result.allowed).toBe(true)
    expect(logWarn).toHaveBeenCalledWith('refund_request.status_read_failed', expect.any(Object))
  })

  it('returns the existing requests and the decision computed from them', async () => {
    queue('orders.select', ownedOrder())
    queue('refund_requests.select', {
      data: [{ status: 'pending', created_at: '2026-01-01', reason_code: 'defective' }],
      error: null,
    })
    const result = await refundRequestStatus(ORDER_ID)
    expect(result).toMatchObject({
      allowed: false,
      message: 'כבר יש בקשת החזר פתוחה על ההזמנה הזו. נעדכן אתכם ברגע שתיבדק.',
      requests: [{ status: 'pending', created_at: '2026-01-01', reason_code: 'defective' }],
    })
  })
})
