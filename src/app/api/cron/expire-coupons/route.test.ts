import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The nightly QR coupon sweep.
 *
 * What is at risk is small on purpose: one RPC that stamps expired_at and
 * moves no money. The tests hold the route to exactly that: the secret gate
 * (this is a public URL, and an unset secret must stay closed, not open), a
 * truthful count on success, and a 500 that carries the database's words on
 * failure so the scheduler's history is a record and not a shrug.
 */

const expireDue = vi.fn()

vi.mock('@/lib/growth/client', () => ({
  growthClient: () => ({ qrRedemption: () => ({ expireDue }) }),
}))

import { GET } from './route'

function request(auth?: string): NextRequest {
  return new NextRequest('https://example.test/api/cron/expire-coupons', {
    headers: auth ? { authorization: auth } : {},
  })
}

describe('coupon QR expiry cron', () => {
  beforeEach(() => {
    expireDue.mockReset()
    expireDue.mockResolvedValue({ data: 4, error: null })
    vi.stubEnv('CRON_SECRET', 's3cret')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('auth', () => {
    it('rejects a request with no credential', async () => {
      expect((await GET(request())).status).toBe(401)
      expect(expireDue).not.toHaveBeenCalled()
    })

    it('rejects a wrong credential', async () => {
      expect((await GET(request('Bearer wrong'))).status).toBe(401)
      expect(expireDue).not.toHaveBeenCalled()
    })

    it('stays closed when CRON_SECRET is unset rather than opening', async () => {
      vi.stubEnv('CRON_SECRET', '')
      expect((await GET(request('Bearer '))).status).toBe(401)
      expect(expireDue).not.toHaveBeenCalled()
    })
  })

  it('sweeps and reports the count', async () => {
    const response = await GET(request('Bearer s3cret'))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, expired: 4 })
  })

  it('reports zero as zero, not as a failure', async () => {
    expireDue.mockResolvedValue({ data: 0, error: null })
    const response = await GET(request('Bearer s3cret'))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, expired: 0 })
  })

  it('surfaces an RPC failure as a 500 that names the reason', async () => {
    expireDue.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const response = await GET(request('Bearer s3cret'))
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ ok: false, error: 'boom' })
  })
})
