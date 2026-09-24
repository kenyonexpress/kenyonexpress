import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The in-memory 301/410 map the proxy consults on every request.
 *
 * The Supabase client is real; only the HTTP boundary is stubbed, so what is
 * proven is the PostgREST request that leaves (anon key, is_active filter,
 * paging by offset) and the caching contract around it: one load per TTL,
 * one loader under concurrency, and fail-open when the table cannot be read.
 */

type Row = { source_path: string; target_path: string; status_code: number }

const requests: URL[] = []
let pages: Row[][] = []
let status = 200

function stubRest() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input : input.url,
    )
    requests.push(url)
    if (status !== 200) {
      return new Response(JSON.stringify({ message: 'boom' }), {
        status,
        headers: { 'content-type': 'application/json' },
      })
    }
    const offset = Number(url.searchParams.get('offset') ?? '0')
    const limit = Number(url.searchParams.get('limit') ?? '1000')
    const page = pages[offset / limit] ?? []
    return new Response(JSON.stringify(page), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const { invalidateRedirectCache, lookupRedirect, normalizePath } = await import('./redirects')

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.test')
  vi.stubEnv('SUPABASE_ANON_KEY', 'anon-key-for-tests')
  requests.length = 0
  status = 200
  pages = [
    [
      { source_path: '/old-page', target_path: '/new-page', status_code: 301 },
      { source_path: '/gone', target_path: '/', status_code: 410 },
      { source_path: '/odd', target_path: '/x', status_code: 302 },
    ],
  ]
  invalidateRedirectCache()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-17T10:00:00.000Z'))
  stubRest()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('lookupRedirect', () => {
  it('reads the active rows through the anon key and answers 301 and 410 hits', async () => {
    expect(await lookupRedirect('/old-page')).toEqual({ target: '/new-page', status: 301 })
    expect(await lookupRedirect('/gone')).toEqual({ target: '/', status: 410 })

    expect(requests).toHaveLength(1)
    const url = requests[0] as URL
    expect(url.origin).toBe('https://project.supabase.test')
    expect(url.pathname).toBe('/rest/v1/seo_redirects')
    expect(url.searchParams.get('select')).toBe('source_path,target_path,status_code')
    expect(url.searchParams.get('is_active')).toBe('eq.true')
    expect(url.searchParams.get('offset')).toBe('0')
    expect(url.searchParams.get('limit')).toBe('1000')
    const init = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as RequestInit
    expect(new Headers(init.headers).get('apikey')).toBe('anon-key-for-tests')
  })

  it('collapses any status that is not 410 to 301', async () => {
    expect(await lookupRedirect('/odd')).toEqual({ target: '/x', status: 301 })
  })

  it('normalises the path before the lookup', async () => {
    expect(await lookupRedirect('/old-page/')).toEqual({ target: '/new-page', status: 301 })
    expect(normalizePath('/old-page/')).toBe('/old-page')
  })

  it('misses on an unknown path without another query', async () => {
    expect(await lookupRedirect('/nothing')).toBeNull()
    expect(await lookupRedirect('/nothing-else')).toBeNull()
    expect(requests).toHaveLength(1)
  })

  it('pages through the table so a large map is never silently truncated', async () => {
    const first = Array.from({ length: 1000 }, (_, i) => ({
      source_path: `/p${i}`,
      target_path: `/t${i}`,
      status_code: 301,
    }))
    pages = [first, [{ source_path: '/last', target_path: '/end', status_code: 301 }]]

    expect(await lookupRedirect('/last')).toEqual({ target: '/end', status: 301 })
    expect(await lookupRedirect('/p999')).toEqual({ target: '/t999', status: 301 })
    expect(requests.map((u) => u.searchParams.get('offset'))).toEqual(['0', '1000'])
  })

  it('shares one load between concurrent cold lookups', async () => {
    const [a, b] = await Promise.all([lookupRedirect('/old-page'), lookupRedirect('/gone')])
    expect(a?.status).toBe(301)
    expect(b?.status).toBe(410)
    expect(requests).toHaveLength(1)
  })

  it('reloads after the TTL and after an explicit invalidation', async () => {
    await lookupRedirect('/old-page')
    vi.setSystemTime(new Date('2026-09-17T10:04:59.000Z'))
    await lookupRedirect('/old-page')
    expect(requests).toHaveLength(1)

    vi.setSystemTime(new Date('2026-09-17T10:05:01.000Z'))
    pages = [[{ source_path: '/old-page', target_path: '/moved-again', status_code: 301 }]]
    expect(await lookupRedirect('/old-page')).toEqual({ target: '/moved-again', status: 301 })
    expect(requests).toHaveLength(2)

    invalidateRedirectCache()
    await lookupRedirect('/old-page')
    expect(requests).toHaveLength(3)
  })

  it('fails open on a cold start when the table cannot be read', async () => {
    status = 500
    expect(await lookupRedirect('/old-page')).toBeNull()
    expect(requests).toHaveLength(1)
  })

  it('keeps serving the stale map when a refresh fails', async () => {
    await lookupRedirect('/old-page')
    vi.setSystemTime(new Date('2026-09-17T10:06:00.000Z'))
    status = 500
    expect(await lookupRedirect('/old-page')).toEqual({ target: '/new-page', status: 301 })
    expect(requests).toHaveLength(2)
  })
})
