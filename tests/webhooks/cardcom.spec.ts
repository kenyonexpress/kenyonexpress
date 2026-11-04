import { __resetPaymentMoneySchemaCache } from '@/lib/payments/payment-money-columns'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The four payload shapes the Cardcom webhook must answer correctly, driven
 * through `/api/webhooks/cardcom` (G1, 05.11.2026). The alias re-exports the
 * handler at `/api/payments/cardcom/webhook`, so these cases prove both paths
 * at once; the deeper matrix (rotation window, 5xx on journal failure, amount
 * mismatch, finalize failure) lives next to the handler in
 * `src/app/api/payments/cardcom/webhook/route.test.ts`.
 *
 * "Signed" here means the callback URL carries the shared secret. Cardcom does
 * not sign bodies; there is no HMAC in this system and none is asserted.
 */

type Result = { data: unknown; error: unknown }

const calls: { table: string; op: string; payload?: unknown }[] = []
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
  calls.push({ table, op, payload })
  const key = `${table}.${op}`
  const proxy: unknown = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') {
          return (resolve: (v: Result) => unknown, reject?: (e: unknown) => unknown) =>
            Promise.resolve(settle(key)).then(resolve, reject)
        }
        return () => {
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
    update: (payload: unknown) => builder(table, 'update', payload),
  }),
}

const capturePaymentAlarm = vi.fn()
const capturePaymentWarning = vi.fn()
const verifyLowProfile = vi.fn()
const finalizeOrder = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => adminClient }))
vi.mock('@/lib/observability/sentry', () => ({
  capturePaymentAlarm: (...args: unknown[]) => capturePaymentAlarm(...args),
  capturePaymentWarning: (...args: unknown[]) => capturePaymentWarning(...args),
  capturePaymentError: vi.fn(),
}))
vi.mock('@/lib/payments', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getPaymentProvider: () => ({ verifyLowProfile }),
}))
vi.mock('@/server/payments/finalize', () => ({
  finalizeOrder: (...args: unknown[]) => finalizeOrder(...args),
}))

import { POST } from '@/app/api/webhooks/cardcom/route'

const SECRET = 'g1-current-secret'
const LOW_PROFILE = 'lp-g1'

function callbackBody(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    terminalnumber: 1000,
    lowprofilecode: LOW_PROFILE,
    ResponseCode: 0,
    InternalDealNumber: '4242',
    ...overrides,
  })
}

function request(secret: string | null, body: string): NextRequest {
  const url = new URL('https://kenyonexpress.co.il/api/webhooks/cardcom')
  if (secret !== null) url.searchParams.set('s', secret)
  return new NextRequest(url, { method: 'POST', body })
}

function seedKnownPayment(): void {
  queue(
    'payments.select',
    { data: null, error: { code: '42703' } },
    {
      data: {
        id: 'pay-g1',
        order_id: 'order-g1',
        status: 'redirected',
        amount_ils: 100,
        cardcom_account_id: null,
      },
      error: null,
    },
  )
  verifyLowProfile.mockResolvedValue({
    success: true,
    amountAgorot: 10_000,
    transactionId: 'tx-g1',
    token: null,
  })
  finalizeOrder.mockResolvedValue({ ok: true })
}

beforeEach(() => {
  calls.length = 0
  queues.clear()
  capturePaymentAlarm.mockReset()
  capturePaymentWarning.mockReset()
  verifyLowProfile.mockReset()
  finalizeOrder.mockReset()
  __resetPaymentMoneySchemaCache()
  vi.stubEnv('CARDCOM_WEBHOOK_SECRET', SECRET)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('/api/webhooks/cardcom', () => {
  it('signed success: journals, re-verifies, finalizes, answers 200', async () => {
    seedKnownPayment()
    const res = await POST(request(SECRET, callbackBody()))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(verifyLowProfile).toHaveBeenCalledWith(LOW_PROFILE)
    expect(finalizeOrder).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: 'order-g1', paymentId: 'pay-g1', transactionId: 'tx-g1' }),
    )
    const journal = calls.find((c) => c.table === 'payment_webhook_events' && c.op === 'insert')
    expect(journal?.payload).toMatchObject({
      provider: 'cardcom',
      external_event_id: `${LOW_PROFILE}:4242`,
      signature_valid: true,
    })
    expect(capturePaymentAlarm).not.toHaveBeenCalled()
  })

  it('unsigned: journals as unauthenticated, alarms, never verifies or finalizes, still 200', async () => {
    seedKnownPayment()
    const res = await POST(request('not-the-secret', callbackBody()))
    expect(res.status).toBe(200)
    const journal = calls.find((c) => c.table === 'payment_webhook_events' && c.op === 'insert')
    expect(journal?.payload).toMatchObject({ signature_valid: false })
    expect(verifyLowProfile).not.toHaveBeenCalled()
    expect(finalizeOrder).not.toHaveBeenCalled()
    expect(capturePaymentAlarm).toHaveBeenCalledTimes(1)
  })

  it('replay: the UNIQUE violation on the journal is a 200 no-op', async () => {
    queue('payment_webhook_events.insert', { data: null, error: { code: '23505' } })
    seedKnownPayment()
    const res = await POST(request(SECRET, callbackBody()))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, replay: true })
    expect(verifyLowProfile).not.toHaveBeenCalled()
    expect(finalizeOrder).not.toHaveBeenCalled()
  })

  it('unknown event: a body that is not a Cardcom callback is journalled and answered 200 without action', async () => {
    const res = await POST(request(SECRET, JSON.stringify({ event: 'SomethingElse', id: 9 })))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    const journal = calls.find((c) => c.table === 'payment_webhook_events' && c.op === 'insert')
    expect(journal?.payload).toMatchObject({ provider: 'cardcom', signature_valid: true })
    expect(String((journal?.payload as { external_event_id: string }).external_event_id)).toMatch(
      /^unparsed:/,
    )
    expect(verifyLowProfile).not.toHaveBeenCalled()
    expect(finalizeOrder).not.toHaveBeenCalled()
    expect(capturePaymentAlarm).not.toHaveBeenCalled()
  })

  it('declined charge: marks the payment failed, records a Sentry warning, never alarms, 200', async () => {
    seedKnownPayment()
    const res = await POST(request(SECRET, callbackBody({ ResponseCode: 101 })))
    expect(res.status).toBe(200)
    const update = calls.find((c) => c.table === 'payments' && c.op === 'update')
    expect(update?.payload).toMatchObject({ status: 'failed', failure_code: '101' })
    expect(capturePaymentWarning).toHaveBeenCalledWith(
      'cardcom declined the charge',
      expect.objectContaining({ stage: 'cardcom_webhook_declined', orderId: 'order-g1' }),
    )
    expect(capturePaymentAlarm).not.toHaveBeenCalled()
    expect(verifyLowProfile).not.toHaveBeenCalled()
  })
})
