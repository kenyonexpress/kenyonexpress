import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { checkSearchDrift } from './drift'

/**
 * The counting invariant (marathon step 9): active undeleted products in the
 * database must equal documents in the index. Both transports can be green
 * while the index is wrong; the count is what notices.
 */

const fetchMock = vi.fn()

function adminCounting(count: number | null, error: { message: string } | null = null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({ is: () => Promise.resolve({ count, error }) }),
      }),
    }),
  } as never
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ numberOfDocuments: 80 }), { status: 200 }),
  )
  vi.stubEnv('MEILISEARCH_HOST', 'http://meili.test/')
  vi.stubEnv('MEILISEARCH_API_KEY', 'mk')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('checkSearchDrift', () => {
  it('skips without touching anything while Meilisearch is unconfigured', async () => {
    vi.stubEnv('MEILISEARCH_API_KEY', '')
    const result = await checkSearchDrift(adminCounting(80))
    expect(result).toEqual({ status: 'skipped', reason: 'meilisearch not configured' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('answers ok when the two counts agree, naming both', async () => {
    expect(await checkSearchDrift(adminCounting(80))).toEqual({
      status: 'ok',
      dbCount: 80,
      indexCount: 80,
    })
    // Trailing slash on the host must not become a double slash in the URL.
    const [url] = fetchMock.mock.calls[0] as [string]
    expect(url).toBe('http://meili.test/indexes/products/stats')
  })

  it('reports drift with a signed gap: positive is stale-extra documents', async () => {
    expect(await checkSearchDrift(adminCounting(78))).toEqual({
      status: 'drift',
      dbCount: 78,
      indexCount: 80,
      gap: 2,
    })
  })

  it('reports missing documents as a negative gap', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ numberOfDocuments: 70 }), { status: 200 }),
    )
    expect(await checkSearchDrift(adminCounting(80))).toMatchObject({ status: 'drift', gap: -10 })
  })

  it('degrades to skipped when the database count fails, saying why', async () => {
    const result = await checkSearchDrift(adminCounting(null, { message: 'timeout' }))
    expect(result).toEqual({ status: 'skipped', reason: 'db count failed: timeout' })
  })

  it('degrades to skipped when the index does not answer, instead of throwing into the probe', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'))
    expect(await checkSearchDrift(adminCounting(80))).toEqual({
      status: 'skipped',
      reason: 'index stats failed: ECONNREFUSED',
    })
  })
})
