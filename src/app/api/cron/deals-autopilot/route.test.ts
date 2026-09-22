import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const isFeatureEnabled = vi.fn()
const ingestCandidates = vi.fn()
const fromMock = vi.fn()

vi.mock('@/server/resilience/flags', () => ({
  isFeatureEnabled: (key: string) => isFeatureEnabled(key),
}))

vi.mock('@/lib/deals-autopilot/ingest', () => ({
  ingestCandidates: (supplierId: string, candidates: unknown[]) =>
    ingestCandidates(supplierId, candidates),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: fromMock }),
}))

vi.mock('@/lib/observability/log', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const SUPPLIER = {
  id: 'sup-1',
  name: 'Spa Co',
  feed_url: 'https://spa.example/feed.json',
  feed_format: 'json',
}

function suppliersReturning(
  rows: unknown[],
  error: { code?: string; message: string } | null = null,
) {
  const result = { data: error ? null : rows, error }
  return () => ({
    select: () => ({
      not: () => ({
        eq: () => Promise.resolve(result),
      }),
    }),
  })
}

function request(auth?: string): NextRequest {
  return new NextRequest('https://example.test/api/cron/deals-autopilot', {
    headers: auth ? { authorization: auth } : {},
  })
}

describe('GET /api/cron/deals-autopilot', () => {
  beforeEach(() => {
    isFeatureEnabled.mockReset().mockResolvedValue(true)
    ingestCandidates
      .mockReset()
      .mockResolvedValue({ inserted: 1, updated: 0, skippedDecided: 0, failed: 0 })
    fromMock.mockReset().mockImplementation(suppliersReturning([SUPPLIER]))
    vi.stubEnv('CRON_SECRET', 's3cret')
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () =>
        Promise.resolve(
          JSON.stringify([{ name: 'x', price: '10', link: 'https://spa.example/x' }]),
        ),
    })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  describe('auth', () => {
    it('rejects a request with no credential', async () => {
      const { GET } = await import('./route')
      expect((await GET(request())).status).toBe(401)
      expect(isFeatureEnabled).not.toHaveBeenCalled()
    })

    it('rejects a wrong credential', async () => {
      const { GET } = await import('./route')
      expect((await GET(request('Bearer wrong'))).status).toBe(401)
    })

    it('stays closed when CRON_SECRET is unset rather than opening', async () => {
      vi.stubEnv('CRON_SECRET', '')
      const { GET } = await import('./route')
      expect((await GET(request('Bearer '))).status).toBe(401)
    })
  })

  it('skips entirely when DEALS_AUTOPILOT is off, touching no supplier', async () => {
    isFeatureEnabled.mockResolvedValue(false)
    const { GET } = await import('./route')
    const res = await GET(request('Bearer s3cret'))
    expect(await res.json()).toEqual({ ok: true, skipped: 'DEALS_AUTOPILOT disabled' })
    // withJobRun writes its own job_runs row regardless; what must NOT
    // happen is a read of suppliers or a fetch of any feed.
    expect(fromMock).not.toHaveBeenCalledWith('suppliers')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('fetches only suppliers with a feed_url on an active status', async () => {
    const { GET } = await import('./route')
    await GET(request('Bearer s3cret'))
    expect(global.fetch).toHaveBeenCalledWith(
      SUPPLIER.feed_url,
      expect.objectContaining({ signal: expect.anything() }),
    )
  })

  it('ingests the parsed candidates for the supplier', async () => {
    const { GET } = await import('./route')
    const res = await GET(request('Bearer s3cret'))
    const body = await res.json()
    expect(ingestCandidates).toHaveBeenCalledWith(
      'sup-1',
      expect.arrayContaining([expect.objectContaining({ nameHe: 'x' })]),
    )
    expect(body.results[0]).toMatchObject({ supplierId: 'sup-1', ok: true, inserted: 1 })
  })

  it('records one supplier failing to fetch without aborting the others', async () => {
    fromMock.mockImplementation(
      suppliersReturning([
        SUPPLIER,
        { ...SUPPLIER, id: 'sup-2', feed_url: 'https://other.example/feed.json' },
      ]),
    )
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500, text: () => Promise.resolve('') })
      .mockResolvedValueOnce({
        ok: true,
        text: () =>
          Promise.resolve(
            JSON.stringify([{ name: 'y', price: '20', link: 'https://other.example/y' }]),
          ),
      })
    const { GET } = await import('./route')
    const res = await GET(request('Bearer s3cret'))
    const body = await res.json()
    expect(body.results[0]).toMatchObject({ supplierId: 'sup-1', ok: false })
    expect(body.results[1]).toMatchObject({ supplierId: 'sup-2', ok: true })
    expect(ingestCandidates).toHaveBeenCalledTimes(1)
  })

  it('reports a suppliers-read failure as a 500 rather than an empty success', async () => {
    fromMock.mockImplementation(suppliersReturning([], { message: 'connection reset' }))
    const { GET } = await import('./route')
    const res = await GET(request('Bearer s3cret'))
    expect(res.status).toBe(500)
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
