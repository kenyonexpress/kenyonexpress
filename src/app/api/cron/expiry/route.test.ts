import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The T-7 / T-1 expiry reminder route (S20).
 *
 * What is pinned: the bearer is checked before anything is read, the bucket
 * is exactly the one asked for (a T-1 call must not re-enqueue the T-7
 * bucket), and the drain runs after the enqueue with the same bearer, so the
 * reminder leaves on this call. An enqueue failure is a 500 with no drain; a
 * drain failure leaves the enqueue standing.
 */

const { rpc, drain } = vi.hoisted(() => ({ rpc: vi.fn(), drain: vi.fn() }))

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc }) }))
vi.mock('@/app/api/cron/notifications/route', () => ({ GET: drain }))

import { GET } from './route'

function request(query: string, auth?: string): NextRequest {
  return new NextRequest(`https://example.test/api/cron/expiry${query}`, {
    headers: auth ? { authorization: auth } : {},
  })
}

describe('expiry reminder cron', () => {
  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', 'test-cron-secret-value')
    rpc.mockReset()
    drain.mockReset()
    rpc.mockResolvedValue({ data: 4, error: null })
    drain.mockResolvedValue(Response.json({ ok: true, pushed: 3, sent: 1 }))
  })
  afterEach(() => vi.unstubAllEnvs())

  it('refuses without the bearer and touches nothing', async () => {
    const res = await GET(request('?days=7'))
    expect(res.status).toBe(401)
    expect(rpc).not.toHaveBeenCalled()
    expect(drain).not.toHaveBeenCalled()
  })

  it('refuses a wrong bearer', async () => {
    const res = await GET(request('?days=7', 'Bearer nope'))
    expect(res.status).toBe(401)
    expect(rpc).not.toHaveBeenCalled()
  })

  it.each(['?days=', '?days=3', '?days=abc', '?days=0'])(
    'refuses bucket %s with 400',
    async (q) => {
      const res = await GET(request(q, 'Bearer test-cron-secret-value'))
      expect(res.status).toBe(400)
      expect(rpc).not.toHaveBeenCalled()
    },
  )

  it.each([7, 1])('T-%i enqueues only its own bucket, then drains', async (days) => {
    const res = await GET(request(`?days=${days}`, 'Bearer test-cron-secret-value'))
    expect(res.status).toBe(200)
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('enqueue_expiring_voucher_notices', { p_buckets: [days] })
    expect(drain).toHaveBeenCalledTimes(1)
    const drainReq = drain.mock.calls[0]?.[0] as NextRequest
    expect(drainReq.headers.get('authorization')).toBe('Bearer test-cron-secret-value')
    expect(new URL(drainReq.url).pathname).toBe('/api/cron/notifications')
    expect(rpc.mock.invocationCallOrder[0] ?? 0).toBeLessThan(
      drain.mock.invocationCallOrder[0] ?? 0,
    )
    expect(await res.json()).toEqual({
      ok: true,
      days,
      enqueued: 4,
      delivery: { ok: true, pushed: 3, sent: 1 },
    })
  })

  it('no days runs both buckets in one enqueue (the manifest fallback)', async () => {
    const res = await GET(request('', 'Bearer test-cron-secret-value'))
    expect(res.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('enqueue_expiring_voucher_notices', { p_buckets: [7, 1] })
    expect(await res.json()).toMatchObject({ ok: true, days: null })
  })

  it('an enqueue failure is a 500 and nothing is drained', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const res = await GET(request('?days=1', 'Bearer test-cron-secret-value'))
    expect(res.status).toBe(500)
    expect(drain).not.toHaveBeenCalled()
  })

  it('a drain failure does not undo the enqueue', async () => {
    drain.mockRejectedValue(new Error('outbox read failed'))
    const res = await GET(request('?days=7', 'Bearer test-cron-secret-value'))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, enqueued: 4, delivery: null })
  })
})
