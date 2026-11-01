import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The sweep that drains the dead-letter queue, which until this route had no
 * production caller at all: `replayDeadLetters` was imported by tests and by
 * nothing else, so a charged-and-verified payment whose finalize failed stayed
 * in the queue until a human read the alarm.
 *
 * `replayDeadLetters` itself is exercised by webhook-dlq.test.ts; what this
 * file checks is the wiring around it - the auth guard, the payment lookup the
 * finalize adapter does, and which outcome raises which signal.
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
const finalizeOrder = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => adminClient }))
vi.mock('@/lib/observability/sentry', () => ({
  capturePaymentAlarm: (...args: unknown[]) => capturePaymentAlarm(...args),
  capturePaymentError: vi.fn(),
}))
vi.mock('@/server/payments/finalize', () => ({
  finalizeOrder: (...args: unknown[]) => finalizeOrder(...args),
}))

import { GET } from './route'

const SECRET = 'cron-secret'

function request(auth: string | null): NextRequest {
  const headers = new Headers()
  if (auth !== null) headers.set('authorization', auth)
  return new NextRequest('https://kenyonexpress.co.il/api/cron/webhook-dlq', { headers })
}

/** One replayable letter in the queue, and the payment row behind it. */
function seedOneLetter(): void {
  queue('payment_webhook_events.select', {
    data: [
      { id: 'evt-1', external_event_id: 'lp-1:77', payment_id: 'pay-1', created_at: '2026-09-09' },
    ],
    error: null,
  })
  queue('payments.select', {
    data: { id: 'pay-1', order_id: 'order-1', cardcom_transaction_id: 'tx-9' },
    error: null,
  })
}

beforeEach(() => {
  calls.length = 0
  queues.clear()
  capturePaymentAlarm.mockReset()
  finalizeOrder.mockReset().mockResolvedValue({ ok: true })
  vi.stubEnv('CRON_SECRET', SECRET)
})

describe('the webhook-dlq sweep', () => {
  it('answers 401 without the bearer, before touching anything', async () => {
    const response = await GET(request(null))
    expect(response.status).toBe(401)
    expect(calls).toHaveLength(0)
  })

  it('answers 401 on the wrong bearer', async () => {
    expect((await GET(request('Bearer not-it'))).status).toBe(401)
  })

  it('reports an empty queue without journalling a sweep that found nothing', async () => {
    queue('payment_webhook_events.select', { data: [], error: null })
    const response = await GET(request(`Bearer ${SECRET}`))
    expect(await response.json()).toEqual({
      ok: true,
      considered: 0,
      replayed: 0,
      failed: 0,
      unreplayable: 0,
    })
    expect(calls.find((c) => c.table === 'payment_events')).toBeUndefined()
  })

  it('finalizes through the payment row and stamps the letter on success', async () => {
    seedOneLetter()
    const response = await GET(request(`Bearer ${SECRET}`))
    expect(await response.json()).toMatchObject({ ok: true, considered: 1, replayed: 1 })
    expect(finalizeOrder).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: 'order-1', paymentId: 'pay-1', transactionId: 'tx-9' }),
    )
    // The stamp is what takes the row out of the queue.
    expect(
      calls.find((c) => c.table === 'payment_webhook_events' && c.op === 'update'),
    ).toBeTruthy()
  })

  it('journals dlq_replay_started when the sweep found work', async () => {
    seedOneLetter()
    await GET(request(`Bearer ${SECRET}`))
    const journal = calls.find((c) => c.table === 'payment_events' && c.op === 'insert')
      ?.payload as Record<string, unknown>
    expect(journal.event_type).toBe('dlq_replay_started')
  })

  it('leaves the letter queued and counts a failure when finalize refuses', async () => {
    seedOneLetter()
    finalizeOrder.mockResolvedValue({ ok: false, error: 'boom', code: 'X' })
    const response = await GET(request(`Bearer ${SECRET}`))
    expect(await response.json()).toMatchObject({ ok: true, failed: 1, replayed: 0 })
    expect(
      calls.find((c) => c.table === 'payment_webhook_events' && c.op === 'update'),
    ).toBeUndefined()
  })

  it('does not finalize a letter whose payment row is gone', async () => {
    // A dead letter pointing at a payment that no longer resolves is a human's
    // problem; inventing a finalize target would be worse than waiting.
    queue('payment_webhook_events.select', {
      data: [
        {
          id: 'evt-1',
          external_event_id: 'lp-1:77',
          payment_id: 'pay-1',
          created_at: '2026-09-09',
        },
      ],
      error: null,
    })
    queue('payments.select', { data: null, error: null })
    const response = await GET(request(`Bearer ${SECRET}`))
    expect(await response.json()).toMatchObject({ ok: true, failed: 1 })
    expect(finalizeOrder).not.toHaveBeenCalled()
  })

  it('alarms on a letter with no payment id, which only a person can place', async () => {
    queue('payment_webhook_events.select', {
      data: [
        { id: 'evt-1', external_event_id: 'lp-1:77', payment_id: null, created_at: '2026-09-09' },
      ],
      error: null,
    })
    const response = await GET(request(`Bearer ${SECRET}`))
    expect(await response.json()).toMatchObject({ ok: true, unreplayable: 1 })
    expect(finalizeOrder).not.toHaveBeenCalled()
    expect(capturePaymentAlarm).toHaveBeenCalledWith(
      expect.stringContaining('no payment id'),
      expect.objectContaining({ stage: 'webhook_dlq_sweep' }),
    )
  })
})
