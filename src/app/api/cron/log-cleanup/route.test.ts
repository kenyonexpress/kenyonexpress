import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The six-hourly rate-limit log cleanup (STEP 37). Pinned: closed without
 * the secret, calls exactly the two database sweeps and nothing else (no
 * table is deleted from here), runs the second even when the first fails,
 * and names the failed sweep in a red response.
 */

const rpc = vi.fn()
const { createAdminClient } = vi.hoisted(() => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient }))

import { GET } from './route'

function request(auth?: string): NextRequest {
  return new NextRequest('https://example.test/api/cron/log-cleanup', {
    headers: auth ? { authorization: auth } : {},
  })
}

describe('log-cleanup cron', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createAdminClient.mockReturnValue({ rpc, from: vi.fn() })
    rpc.mockResolvedValue({ data: null, error: null })
    vi.stubEnv('CRON_SECRET', 's3cret')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('auth', () => {
    it('rejects a request with no credential before building a client', async () => {
      expect((await GET(request())).status).toBe(401)
      expect(createAdminClient).not.toHaveBeenCalled()
    })

    it('rejects a wrong credential', async () => {
      expect((await GET(request('Bearer wrong'))).status).toBe(401)
      expect(rpc).not.toHaveBeenCalled()
    })

    it('stays closed when CRON_SECRET is unset rather than opening', async () => {
      vi.stubEnv('CRON_SECRET', '')
      expect((await GET(request('Bearer '))).status).toBe(401)
    })
  })

  it('runs the two sweeps, in order, through RPC and touches no table directly', async () => {
    const response = await GET(request('Bearer s3cret'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ ok: true, swept: ['cleanup_rate_limits', 'cleanup_user_rate_limits'] })
    expect(rpc.mock.calls).toEqual([['cleanup_rate_limits'], ['cleanup_user_rate_limits']])
    const client = createAdminClient.mock.results[0]?.value as { from: ReturnType<typeof vi.fn> }
    expect(client.from).not.toHaveBeenCalled()
  })

  it('still runs the second sweep when the first fails, and names the failure', async () => {
    rpc
      .mockResolvedValueOnce({ data: null, error: { message: 'permission denied' } })
      .mockResolvedValueOnce({ data: null, error: null })

    const response = await GET(request('Bearer s3cret'))

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      ok: false,
      swept: ['cleanup_user_rate_limits'],
      failed: { cleanup_rate_limits: 'permission denied' },
    })
    expect(rpc).toHaveBeenCalledTimes(2)
  })
})
