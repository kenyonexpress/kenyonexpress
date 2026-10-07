import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const pollActiveShipments = vi.fn()
vi.mock('@/server/shipping/tracking-poll', () => ({
  pollActiveShipments: (...a: unknown[]) => pollActiveShipments(...a),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/observability/log', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { GET } from './route'

describe('/api/cron/shipments-track', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 'test-cron-secret-0123456789'
    pollActiveShipments.mockReset()
  })
  afterEach(() => {
    process.env.CRON_SECRET = undefined
  })

  it('refuses without the bearer, and with the secret unset', async () => {
    const res = await GET(new NextRequest('http://localhost/api/cron/shipments-track'))
    expect(res.status).toBe(401)
    process.env.CRON_SECRET = ''
    const res2 = await GET(
      new NextRequest('http://localhost/api/cron/shipments-track', {
        headers: { authorization: 'Bearer ' },
      }),
    )
    expect(res2.status).toBe(401)
    expect(pollActiveShipments).not.toHaveBeenCalled()
  })

  it('polls and reports the summary, including a missing table', async () => {
    pollActiveShipments.mockResolvedValue({
      polled: 0,
      updated: 0,
      delivered: 0,
      failed: 0,
      skipped: 'table_missing',
    })
    const res = await GET(
      new NextRequest('http://localhost/api/cron/shipments-track', {
        headers: { authorization: 'Bearer test-cron-secret-0123456789' },
      }),
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      ok: true,
      polled: 0,
      updated: 0,
      delivered: 0,
      failed: 0,
      skipped: 'table_missing',
    })
  })
})
