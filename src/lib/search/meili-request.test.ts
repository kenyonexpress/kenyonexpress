import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const logWarn = vi.fn()
vi.mock('@/lib/observability/log', () => ({
  log: { warn: (...a: unknown[]) => logWarn(...a), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const { meiliConfigured, meiliSearch, rejectsLocales } = await import('./meili-request')

type Call = [string, RequestInit]

function answering(responses: { status: number; body: unknown }[]) {
  const queue = [...responses]
  const fetchMock = vi.fn(async () => {
    const next = queue.shift() ?? { status: 500, body: {} }
    return { ok: next.status < 300, status: next.status, json: async () => next.body }
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

/**
 * UX21: the engine's silence was the defect. Production had the host and the
 * key set, `/api/ready` said `meilisearch: ok`, and every search fell back
 * to Postgres with no log line, because three callers each swallowed the
 * failure. Every failure now leaves a warning with the status and the
 * Meilisearch error code, and the one failure that is a version gap (a
 * server rejecting `locales`) is retried without the field.
 */
describe('meiliSearch', () => {
  beforeEach(() => {
    vi.stubEnv('MEILISEARCH_HOST', 'https://meili.test/')
    vi.stubEnv('MEILISEARCH_API_KEY', 'meili-key')
    logWarn.mockReset()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('POSTs to the index with the bearer, the body and no cache, and hands the JSON back', async () => {
    const fetchMock = answering([{ status: 200, body: { hits: [{ id: 'a' }] } }])
    const outcome = await meiliSearch('products', { q: 'ספא', limit: 3, locales: ['heb'] })

    expect(outcome).toEqual({ ok: true, data: { hits: [{ id: 'a' }] } })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as Call
    expect(url).toBe('https://meili.test/indexes/products/search')
    expect(init.method).toBe('POST')
    expect(init.cache).toBe('no-store')
    expect(init.headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer meili-key',
    })
    expect(JSON.parse(String(init.body))).toEqual({ q: 'ספא', limit: 3, locales: ['heb'] })
    expect(logWarn).not.toHaveBeenCalled()
  })

  it('logs a non-2xx with the status and the error code, and fails closed', async () => {
    answering([
      {
        status: 404,
        body: {
          message: 'Index `products` not found.',
          code: 'index_not_found',
          type: 'invalid_request',
        },
      },
    ])
    const outcome = await meiliSearch('products', { q: 'ספא' })

    expect(outcome).toEqual({ ok: false, reason: 'index_not_found' })
    expect(logWarn).toHaveBeenCalledWith('search.meili_unavailable', {
      index: 'products',
      status: 404,
      code: 'index_not_found',
      message: 'Index `products` not found.',
    })
  })

  it('names the HTTP status when the body carries no code', async () => {
    answering([{ status: 503, body: {} }])
    expect(await meiliSearch('products', { q: 'x' })).toEqual({ ok: false, reason: 'http_503' })
    expect(logWarn).toHaveBeenCalledWith(
      'search.meili_unavailable',
      expect.objectContaining({ status: 503, code: null }),
    )
  })

  it('logs a thrown fetch as a network failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED')
      }),
    )
    expect(await meiliSearch('products', { q: 'x' })).toEqual({ ok: false, reason: 'network' })
    expect(logWarn).toHaveBeenCalledWith('search.meili_unavailable', {
      index: 'products',
      status: null,
      reason: 'ECONNREFUSED',
    })
  })

  it('retries once without locales when the server rejects the field', async () => {
    const fetchMock = answering([
      { status: 400, body: { message: 'Unknown field `locales`', code: 'bad_request' } },
      { status: 200, body: { hits: [] } },
    ])
    const outcome = await meiliSearch('products', { q: 'ספא', locales: ['heb'] })

    expect(outcome).toEqual({ ok: true, data: { hits: [] } })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const second = JSON.parse(String((fetchMock.mock.calls[1] as unknown as Call)[1].body))
    expect(second).toEqual({ q: 'ספא' })
    expect(logWarn).toHaveBeenCalledWith(
      'search.meili_locales_unsupported',
      expect.objectContaining({ index: 'products', status: 400 }),
    )
    expect(logWarn).not.toHaveBeenCalledWith('search.meili_unavailable', expect.anything())
  })

  it('reports the retry failure when the second request fails too', async () => {
    answering([
      { status: 400, body: { code: 'invalid_search_locales', message: 'locales' } },
      {
        status: 403,
        body: { code: 'invalid_api_key', message: 'The provided API key is invalid.' },
      },
    ])
    expect(await meiliSearch('products', { q: 'x', locales: ['eng'] })).toEqual({
      ok: false,
      reason: 'invalid_api_key',
    })
  })

  it('does not retry a 400 that is not about locales, nor a body without locales', async () => {
    const fetchMock = answering([
      { status: 400, body: { code: 'invalid_search_filter', message: 'bad filter' } },
    ])
    expect(await meiliSearch('products', { q: 'x', locales: ['heb'] })).toEqual({
      ok: false,
      reason: 'invalid_search_filter',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const again = answering([{ status: 400, body: { message: 'Unknown field `locales`' } }])
    expect(await meiliSearch('products', { q: 'x' })).toMatchObject({ ok: false })
    expect(again).toHaveBeenCalledTimes(1)
  })
})

describe('rejectsLocales', () => {
  it('is the 1.10 code or a 400 whose message names the field', () => {
    expect(rejectsLocales(400, { code: 'invalid_search_locales' })).toBe(true)
    expect(
      rejectsLocales(400, { message: 'Unknown field `locales`: expected one of q, ...' }),
    ).toBe(true)
    expect(rejectsLocales(400, { message: 'bad filter' })).toBe(false)
    expect(rejectsLocales(500, { message: 'locales' })).toBe(false)
  })
})

describe('meiliConfigured', () => {
  it('needs both the host and the key', () => {
    const env = (vars: Record<string, string>) => vars as unknown as NodeJS.ProcessEnv
    expect(meiliConfigured(env({ MEILISEARCH_HOST: 'h', MEILISEARCH_API_KEY: 'k' }))).toBe(true)
    expect(meiliConfigured(env({ MEILISEARCH_HOST: 'h' }))).toBe(false)
    expect(meiliConfigured(env({ MEILISEARCH_API_KEY: 'k' }))).toBe(false)
  })
})
