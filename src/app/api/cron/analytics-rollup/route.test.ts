import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The analytics rollup backstop (STEP 37). Pinned: closed without the secret,
 * skips when pg_cron's nightly rebuild is fresh, rebuilds through the one
 * service-role function when it is not, and is red when either the read or
 * the rebuild fails.
 */

const rpc = vi.fn()
const maybeSingle = vi.fn()
const limit = vi.fn(() => ({ maybeSingle }))
const order = vi.fn(() => ({ limit }))
const select = vi.fn(() => ({ order }))
const from = vi.fn(() => ({ select }))

const { createAdminClient } = vi.hoisted(() => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient }))

import { FRESH_WINDOW_MS, GET } from './route'

function request(auth?: string): NextRequest {
  return new NextRequest('https://example.test/api/cron/analytics-rollup', {
    headers: auth ? { authorization: auth } : {},
  })
}

const NOW = new Date('2026-10-08T02:30:00Z')

describe('analytics-rollup cron', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createAdminClient.mockReturnValue({ from, rpc })
    rpc.mockResolvedValue({ data: null, error: null })
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    vi.stubEnv('CRON_SECRET', 's3cret')
  })

  afterEach(() => {
    vi.useRealTimers()
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

  it('skips without rebuilding when pg_cron refreshed within the window', async () => {
    const at = new Date(NOW.getTime() - 60 * 60 * 1000).toISOString()
    maybeSingle.mockResolvedValue({ data: { refreshed_at: at }, error: null })

    const response = await GET(request('Bearer s3cret'))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, skipped: true, refreshedAt: at })
    expect(rpc).not.toHaveBeenCalled()
    expect(from).toHaveBeenCalledWith('report_revenue_daily')
    expect(order).toHaveBeenCalledWith('refreshed_at', { ascending: false })
  })

  it('rebuilds through refresh_report_tables when the rollup is stale', async () => {
    const stale = new Date(NOW.getTime() - FRESH_WINDOW_MS - 1).toISOString()
    const fresh = NOW.toISOString()
    maybeSingle
      .mockResolvedValueOnce({ data: { refreshed_at: stale }, error: null })
      .mockResolvedValueOnce({ data: { refreshed_at: fresh }, error: null })

    const response = await GET(request('Bearer s3cret'))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, skipped: false, refreshedAt: fresh })
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('refresh_report_tables')
  })

  it('rebuilds when the tables are empty, and reports null rather than failing', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null })

    const response = await GET(request('Bearer s3cret'))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, skipped: false, refreshedAt: null })
    expect(rpc).toHaveBeenCalledWith('refresh_report_tables')
  })

  it('is red when the rebuild fails', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null })
    rpc.mockResolvedValue({ data: null, error: { message: 'permission denied' } })

    const response = await GET(request('Bearer s3cret'))

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ ok: false, error: 'permission denied' })
  })

  it('is red when the freshness read fails, without rebuilding blind', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { message: 'relation missing' } })

    const response = await GET(request('Bearer s3cret'))

    expect(response.status).toBe(500)
    expect(rpc).not.toHaveBeenCalled()
  })
})
