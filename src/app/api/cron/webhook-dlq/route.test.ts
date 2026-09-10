import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The sweep that drains the Cardcom dead-letter queue.
 *
 * The queue definition, the backoff and the ceiling are covered by
 * `webhook-dlq.test.ts`. What is tested HERE is the wiring, because the module
 * it wires spent its whole life with no caller at all: the bearer, that a
 * missing Cardcom configuration does NOT skip this job the way it correctly
 * skips `stranded-payments`, and that the alarm keys off the DEPTH of the queue
 * rather than off how many replays happened to fail this run.
 */

const sweepDeadLetters = vi.fn()
const capturePaymentAlarm = vi.fn()
const finalizeForReplay = vi.fn(() => async () => ({ ok: true }))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: vi.fn() }),
}))

vi.mock('@/lib/observability/sentry', () => ({
  capturePaymentAlarm: (...args: unknown[]) => capturePaymentAlarm(...args),
}))

vi.mock('@/lib/observability/job-run', () => ({
  withJobRun:
    (_name: string, handler: (request: NextRequest) => Promise<Response>) =>
    (request: NextRequest) =>
      handler(request),
}))

vi.mock('@/server/payments/replay-finalize', () => ({
  finalizeForReplay: (...args: unknown[]) => finalizeForReplay(...(args as [])),
}))

vi.mock('@/server/payments/webhook-dlq', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/payments/webhook-dlq')>()
  return { ...actual, sweepDeadLetters: (...args: unknown[]) => sweepDeadLetters(...args) }
})

import { GET } from './route'

const SECRET = 'test-cron-secret'

function request(auth?: string): NextRequest {
  return new NextRequest('https://example.test/api/cron/webhook-dlq', {
    headers: auth ? { authorization: auth } : {},
  })
}

function sweep(overrides: Record<string, unknown> = {}) {
  return {
    results: [],
    depth: 0,
    replayed: 0,
    succeeded: 0,
    failed: 0,
    stuck: 0,
    waiting: 0,
    unreplayable: 0,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.CRON_SECRET = SECRET
  sweepDeadLetters.mockResolvedValue(sweep())
})

afterEach(() => {
  process.env.CRON_SECRET = undefined
})

describe('the webhook dead-letter sweep', () => {
  it('refuses a request without the scheduler bearer', async () => {
    const response = await GET(request())
    expect(response.status).toBe(401)
    expect(sweepDeadLetters).not.toHaveBeenCalled()
  })

  it('refuses a bearer that is merely close', async () => {
    const response = await GET(request(`Bearer ${SECRET}x`))
    expect(response.status).toBe(401)
  })

  it('sweeps even with no Cardcom credentials configured', async () => {
    // THE POINT OF THE SEPARATE ROUTE. `stranded-payments` skips without a
    // provider because it must ASK the provider. This job asks nobody: the
    // charge was verified before the row became a dead letter, and all that is
    // left is our own finalize. A skip here would make the queue undrainable on
    // exactly the deployment whose missing credentials broke finalize.
    // biome-ignore lint/performance/noDelete: the tested condition is absence
    delete process.env.CARDCOM_TERMINAL_NUMBER
    // biome-ignore lint/performance/noDelete: the tested condition is absence
    delete process.env.CARDCOM_API_NAME
    const response = await GET(request(`Bearer ${SECRET}`))

    expect(response.status).toBe(200)
    expect(sweepDeadLetters).toHaveBeenCalledTimes(1)
    await expect(response.json()).resolves.toMatchObject({ ok: true, depth: 0 })
  })

  it('does not alarm on a queue at or below the threshold', async () => {
    sweepDeadLetters.mockResolvedValue(sweep({ depth: 5, failed: 5, replayed: 5 }))
    await GET(request(`Bearer ${SECRET}`))
    expect(capturePaymentAlarm).not.toHaveBeenCalled()
  })

  it('alarms on DEPTH, not on the count of failures this run', async () => {
    // Six open charges with zero failures this sweep - every one of them inside
    // a backoff window - is still six customers holding a charge against an
    // open order. Keying the alarm off `failed` would go quiet exactly when the
    // backlog stops being retried.
    sweepDeadLetters.mockResolvedValue(sweep({ depth: 6, waiting: 6 }))
    await GET(request(`Bearer ${SECRET}`))

    expect(capturePaymentAlarm).toHaveBeenCalledTimes(1)
    const [message, context] = capturePaymentAlarm.mock.calls[0] as [
      string,
      { stage: string; detail: Record<string, unknown> },
    ]
    expect(message).toContain('dead-letter')
    expect(context.detail).toMatchObject({ depth: 6, threshold: 5 })
  })

  it('reports the sweep counts rather than a bare ok', async () => {
    // The scheduler discards the body, but `withJobRun` summarises it into
    // `job_runs`, which is the only place a run that did nothing is
    // distinguishable from a run that drained four charges.
    sweepDeadLetters.mockResolvedValue(
      sweep({ depth: 2, replayed: 3, succeeded: 1, failed: 2, stuck: 1, waiting: 4 }),
    )
    const response = await GET(request(`Bearer ${SECRET}`))

    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      depth: 2,
      replayed: 3,
      succeeded: 1,
      failed: 2,
      stuck: 1,
      waiting: 4,
    })
  })
})
