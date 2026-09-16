import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The hourly sync: closed to strangers, inert without an engine, and honest
 * about a failure. A full rewrite of the index is the most expensive thing
 * the search stack does, so an anonymous caller must not be able to trigger
 * it, and a run that half-failed must not answer 200.
 */

const { syncCatalogue, checkSearchDrift, isMeilisearchConfigured } = vi.hoisted(() => ({
  syncCatalogue: vi.fn(),
  checkSearchDrift: vi.fn(),
  isMeilisearchConfigured: vi.fn(),
}))

vi.mock('@/lib/search/meilisearch', () => ({ syncCatalogue }))
vi.mock('@/lib/search/drift', () => ({ checkSearchDrift }))
vi.mock('@/lib/search/indexer', () => ({ isMeilisearchConfigured }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))

import { GET } from './route'

function request(auth?: string): NextRequest {
  return new NextRequest('https://example.test/api/cron/search-reindex', {
    headers: auth ? { authorization: auth } : {},
  })
}

describe('search-reindex cron', () => {
  beforeEach(() => {
    syncCatalogue.mockReset()
    checkSearchDrift.mockReset()
    isMeilisearchConfigured.mockReset().mockReturnValue(true)
    vi.stubEnv('CRON_SECRET', 's3cret')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('rejects a request with no credential before touching the index', async () => {
    expect((await GET(request())).status).toBe(401)
    expect(syncCatalogue).not.toHaveBeenCalled()
  })

  it('rejects a wrong credential', async () => {
    expect((await GET(request('Bearer wrong'))).status).toBe(401)
    expect(syncCatalogue).not.toHaveBeenCalled()
  })

  it('stays closed when CRON_SECRET is unset rather than opening', async () => {
    vi.stubEnv('CRON_SECRET', '')
    expect((await GET(request('Bearer '))).status).toBe(401)
    expect(syncCatalogue).not.toHaveBeenCalled()
  })

  it('does nothing while Meilisearch is unconfigured, and says so', async () => {
    isMeilisearchConfigured.mockReturnValue(false)
    const res = await GET(request('Bearer s3cret'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, skipped: 'meilisearch not configured' })
    expect(syncCatalogue).not.toHaveBeenCalled()
  })

  it('reports the sync counts and the post-sync drift', async () => {
    syncCatalogue.mockResolvedValue({
      skipped: false,
      products: 80,
      coupons: 41,
      pruned: 2,
      taskUids: [1, 2, 3],
    })
    checkSearchDrift.mockResolvedValue({ status: 'ok', dbCount: 80, indexCount: 80 })
    const res = await GET(request('Bearer s3cret'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ ok: true, products: 80, coupons: 41, pruned: 2 })
    expect(body.drift).toEqual({ status: 'ok', dbCount: 80, indexCount: 80 })
    expect(typeof body.ms).toBe('number')
  })

  it('answers 500 when the sync throws, so the scheduler records a failure', async () => {
    syncCatalogue.mockRejectedValue(new Error('meilisearch PUT -> 503'))
    const res = await GET(request('Bearer s3cret'))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ ok: false, error: 'reindex_failed' })
    expect(checkSearchDrift).not.toHaveBeenCalled()
  })
})
