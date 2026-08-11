import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ rpc }),
}))

import { GET } from './route'

function request(auth?: string): NextRequest {
  return new NextRequest('https://example.test/api/cron/reap-carts', {
    headers: auth ? { authorization: auth } : {},
  })
}

describe('cart reaper route', () => {
  beforeEach(() => {
    rpc.mockReset()
    vi.stubEnv('CRON_SECRET', 's3cret')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('auth', () => {
    it('rejects a request with no credential', async () => {
      expect((await GET(request())).status).toBe(401)
      expect(rpc).not.toHaveBeenCalled()
    })

    it('rejects a wrong credential', async () => {
      expect((await GET(request('Bearer wrong'))).status).toBe(401)
      expect(rpc).not.toHaveBeenCalled()
    })

    it('stays closed when CRON_SECRET is unset rather than opening', async () => {
      // The absence of a secret must not mean "no auth required". This route
      // deletes rows, and an unconfigured deploy is the one most likely to be
      // found by someone else first.
      vi.stubEnv('CRON_SECRET', '')
      expect((await GET(request('Bearer '))).status).toBe(401)
      expect(rpc).not.toHaveBeenCalled()
    })
  })

  describe('draining', () => {
    it('stops after a short batch', async () => {
      rpc.mockResolvedValueOnce({ data: 12, error: null })
      const response = await GET(request('Bearer s3cret'))
      expect(await response.json()).toEqual({ ok: true, reaped: 12 })
      expect(rpc).toHaveBeenCalledTimes(1)
    })

    it('keeps going while batches come back full, and sums them', async () => {
      rpc
        .mockResolvedValueOnce({ data: 500, error: null })
        .mockResolvedValueOnce({ data: 500, error: null })
        .mockResolvedValueOnce({ data: 7, error: null })
      const response = await GET(request('Bearer s3cret'))
      expect(await response.json()).toEqual({ ok: true, reaped: 1007 })
      expect(rpc).toHaveBeenCalledTimes(3)
    })

    it('caps the batches so one invocation cannot run unbounded', async () => {
      rpc.mockResolvedValue({ data: 500, error: null })
      const response = await GET(request('Bearer s3cret'))
      expect(await response.json()).toEqual({ ok: true, reaped: 5000 })
      expect(rpc).toHaveBeenCalledTimes(10)
    })

    it('asks for a bounded batch every time', async () => {
      rpc.mockResolvedValueOnce({ data: 0, error: null })
      await GET(request('Bearer s3cret'))
      expect(rpc).toHaveBeenCalledWith('fn_reap_expired_carts', { p_limit: 500 })
    })

    it('reports what it already deleted when a later batch fails', async () => {
      // Each batch commits on its own. Reporting 0 here would read as "nothing
      // happened" and invite a second sweep over rows already gone.
      rpc
        .mockResolvedValueOnce({ data: 500, error: null })
        .mockResolvedValueOnce({ data: null, error: { message: 'deadlock detected' } })
      const response = await GET(request('Bearer s3cret'))
      expect(response.status).toBe(500)
      expect(await response.json()).toMatchObject({ ok: false, reaped: 500 })
    })
  })
})
