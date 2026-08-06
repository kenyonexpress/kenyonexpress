import { __resetPaymentMoneySchemaCache } from '@/lib/payments/payment-money-columns'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The money path's front door, which had no test at all before [50].
 *
 * The cases that matter here are the ones that answer 200 while nothing
 * happened. Cardcom retries on a non-2xx and stops on a 2xx, so every "silent
 * OK" in this route is a charged card and an order that stays open forever, and
 * the customer is the one who finds out.
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
        return (...__args: unknown[]) => {
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
const verifyLowProfile = vi.fn()
const finalizeOrder = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => adminClient }))
vi.mock('@/lib/observability/sentry', () => ({
  capturePaymentAlarm: (...args: unknown[]) => capturePaymentAlarm(...args),
  capturePaymentError: vi.fn(),
}))
vi.mock('@/lib/payments', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getPaymentProvider: () => ({ verifyLowProfile }),
}))
vi.mock('@/server/payments/finalize', () => ({
  finalizeOrder: (...args: unknown[]) => finalizeOrder(...args),
}))

import { POST } from './route'

const SECRET = 'the-current-secret'
const PREVIOUS = 'the-previous-secret'
const LOW_PROFILE = 'lp-123'

function callbackBody(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    terminalnumber: 1000,
    lowprofilecode: LOW_PROFILE,
    ResponseCode: 0,
    InternalDealNumber: '77',
    ...overrides,
  })
}

function request(secret: string | null, body: string): NextRequest {
  const url = new URL('https://kenyonexpress.co.il/api/payments/cardcom/webhook')
  if (secret !== null) url.searchParams.set('s', secret)
  return new NextRequest(url, { method: 'POST', body })
}

/** Everything after the event insert, for a callback that should finalize. */
function seedHappyPath(): void {
  queue(
    'payments.select',
    { data: null, error: { code: '42703' } },
    {
      data: {
        id: 'pay-1',
        order_id: 'order-1',
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
    transactionId: 'tx-1',
    token: null,
  })
  finalizeOrder.mockResolvedValue({ ok: true })
}

beforeEach(() => {
  calls.length = 0
  queues.clear()
  capturePaymentAlarm.mockReset()
  verifyLowProfile.mockReset()
  finalizeOrder.mockReset()
  __resetPaymentMoneySchemaCache()
  vi.stubEnv('CARDCOM_WEBHOOK_SECRET', SECRET)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('secret rotation', () => {
  it('accepts the current secret', async () => {
    seedHappyPath()
    const response = await POST(request(SECRET, callbackBody()))
    expect(await response.json()).toEqual({ ok: true })
    expect(finalizeOrder).toHaveBeenCalled()
  })

  it('accepts the secret being retired, so a rotation has a window', async () => {
    // Payment pages already open in shoppers' browsers carry the OLD secret in
    // their IndicatorUrl. Without this, rotating drops every one of them.
    vi.stubEnv('CARDCOM_WEBHOOK_SECRET_PREVIOUS', PREVIOUS)
    seedHappyPath()
    await POST(request(PREVIOUS, callbackBody()))
    expect(finalizeOrder).toHaveBeenCalled()
  })

  it('refuses a secret that is neither', async () => {
    vi.stubEnv('CARDCOM_WEBHOOK_SECRET_PREVIOUS', PREVIOUS)
    await POST(request('neither-of-them', callbackBody()))
    expect(finalizeOrder).not.toHaveBeenCalled()
  })

  it('refuses an empty ?s= even when PREVIOUS is unset', async () => {
    // The direction that turns a missing variable into an open endpoint: an
    // empty provided value must not compare equal to an absent secret.
    await POST(request('', callbackBody()))
    expect(finalizeOrder).not.toHaveBeenCalled()
  })

  it('refuses a request with no ?s= at all', async () => {
    await POST(request(null, callbackBody()))
    expect(finalizeOrder).not.toHaveBeenCalled()
  })
})

describe('a rejected callback', () => {
  it('journals it as unauthenticated rather than dropping it', async () => {
    await POST(request('wrong', callbackBody()))
    const insert = calls.find((c) => c.table === 'payment_webhook_events')?.payload as Record<
      string,
      unknown
    >
    expect(insert.signature_valid).toBe(false)
  })

  it('raises the alarm when the body IS a Cardcom callback', async () => {
    // This is a rotation done on one side only, and it is invisible otherwise:
    // 200 to Cardcom, no retry, and every paid order silently stays open.
    await POST(request('wrong', callbackBody()))
    expect(capturePaymentAlarm).toHaveBeenCalledWith(
      expect.stringContaining('no accepted secret matched'),
      expect.objectContaining({ stage: 'cardcom_webhook_secret' }),
    )
  })

  it('stays quiet for a scanner posting something that is not a callback', async () => {
    // An alarm per internet scanner is an alarm nobody reads.
    await POST(request('wrong', '{"hello":"world"}'))
    expect(capturePaymentAlarm).not.toHaveBeenCalled()
  })

  it('answers 200 either way, so nothing is learned from the response', async () => {
    expect((await POST(request('wrong', callbackBody()))).status).toBe(200)
    expect((await POST(request('wrong', 'garbage'))).status).toBe(200)
  })
})

describe('the journal insert, which used to swallow every failure', () => {
  it('treats a unique violation as the replay it is', async () => {
    queue('payment_webhook_events.insert', {
      data: null,
      error: { code: '23505', message: 'duplicate key' },
    })
    const response = await POST(request(SECRET, callbackBody()))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, replay: true })
    expect(finalizeOrder).not.toHaveBeenCalled()
  })

  it('answers 503 on any OTHER insert failure, so Cardcom retries', async () => {
    // The bug this closes. A connection reset used to answer
    // `{ok:true, replay:true}` with a 200: Cardcom stops retrying, GetLpResult
    // is never called, the order stays open, and the dead-letter row that
    // webhook-dlq.ts replays was never written — so nothing knows.
    queue('payment_webhook_events.insert', {
      data: null,
      error: { code: '08006', message: 'connection failure' },
    })
    const response = await POST(request(SECRET, callbackBody()))
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ ok: false, error: 'event_not_recorded' })
  })

  it('raises the alarm on that failure rather than only returning a status', async () => {
    queue('payment_webhook_events.insert', {
      data: null,
      error: { code: '08006', message: 'connection failure' },
    })
    await POST(request(SECRET, callbackBody()))
    expect(capturePaymentAlarm).toHaveBeenCalledWith(
      expect.stringContaining('could not be journalled'),
      expect.objectContaining({ stage: 'cardcom_webhook_persist' }),
    )
  })

  it('dedups on the low profile id and the deal number together', async () => {
    seedHappyPath()
    await POST(request(SECRET, callbackBody()))
    const insert = calls.find((c) => c.table === 'payment_webhook_events')?.payload as Record<
      string,
      unknown
    >
    expect(insert.external_event_id).toBe(`${LOW_PROFILE}:77`)
  })
})

describe('re-verification is what is trusted, never the body', () => {
  it('alarms and does not finalize when GetLpResult disagrees', async () => {
    seedHappyPath()
    verifyLowProfile.mockResolvedValue({ success: false, amountAgorot: null })
    const response = await POST(request(SECRET, callbackBody()))
    expect(await response.json()).toEqual({ ok: true, verified: false })
    expect(finalizeOrder).not.toHaveBeenCalled()
    expect(capturePaymentAlarm).toHaveBeenCalled()
  })

  it('alarms and does not finalize on an amount we did not ask for', async () => {
    seedHappyPath()
    verifyLowProfile.mockResolvedValue({
      success: true,
      amountAgorot: 99_900,
      transactionId: 'tx-1',
      token: null,
    })
    const response = await POST(request(SECRET, callbackBody()))
    expect(await response.json()).toEqual({ ok: true, amount_mismatch: true })
    expect(finalizeOrder).not.toHaveBeenCalled()
  })

  it('never asks Cardcom about a declined callback', async () => {
    seedHappyPath()
    const response = await POST(request(SECRET, callbackBody({ ResponseCode: 500 })))
    expect(await response.json()).toEqual({ ok: true })
    expect(verifyLowProfile).not.toHaveBeenCalled()
  })

  it('answers a non-ok body when finalize fails, so the charge is not marked done', async () => {
    seedHappyPath()
    finalizeOrder.mockResolvedValue({ ok: false, error: 'boom', code: 'X' })
    const response = await POST(request(SECRET, callbackBody()))
    expect(await response.json()).toEqual({ ok: false })
    expect(capturePaymentAlarm).toHaveBeenCalledWith(
      expect.stringContaining('finalize failed'),
      expect.objectContaining({ stage: 'cardcom_webhook_finalize' }),
    )
  })
})
