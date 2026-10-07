import { describe, expect, it, vi } from 'vitest'
import {
  CLOUDFLARE_URLS_PER_CALL,
  VERCEL_TAGS_PER_CALL,
  chunk,
  publicUrlsForKeys,
  purgeImageCache,
  sourceImagesForKey,
  tagsForPurge,
} from './purge'

type Call = { url: string; init: RequestInit }

function fetchStub(status = 200) {
  const calls: Call[] = []
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    return new Response(status >= 400 ? 'nope' : '{}', { status })
  }) as unknown as typeof fetch
  return { calls, fetchImpl }
}

const body = (c: Call) => JSON.parse(String(c.init.body)) as Record<string, unknown>

describe('purge request shaping', () => {
  it('sends only the key tag per key; `all` is the one site-wide tag', () => {
    expect(tagsForPurge({ keys: ['products/a.webp', 'products/a.webp', 'wp/ab/c.webp'] })).toEqual([
      'image:products%2Fa.webp',
      'image:wp%2Fab%2Fc.webp',
    ])
    expect(tagsForPurge({ keys: ['products/a.webp'], all: true })).toEqual(['images'])
  })

  it('names every path the optimizer may have fetched the key under', () => {
    expect(sourceImagesForKey('products/b7.avif')).toEqual([
      '/images/r2/products/b7.avif',
      '/images/products/b7.avif',
    ])
    expect(sourceImagesForKey('wp/ab/c.webp')).toEqual([
      '/images/r2/wp/ab/c.webp',
      '/images/cdn/wp/ab/c.webp',
    ])
  })

  it('builds public URLs only from an absolute base, encoding each segment', () => {
    expect(publicUrlsForKeys(['products/a b.webp'], 'https://cdn.example.com/')).toEqual([
      'https://cdn.example.com/products/a%20b.webp',
    ])
    expect(publicUrlsForKeys(['products/a.webp'], '/images/r2')).toEqual([])
    expect(publicUrlsForKeys(['products/a.webp'], undefined)).toEqual([])
  })

  it('chunks to the backend ceilings', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    expect(VERCEL_TAGS_PER_CALL).toBe(16)
    expect(CLOUDFLARE_URLS_PER_CALL).toBe(30)
  })
})

describe('purgeImageCache', () => {
  it('reports every backend unconfigured, calls nothing, and is not a purge', async () => {
    const { calls, fetchImpl } = fetchStub()
    const out = await purgeImageCache({ keys: ['products/a.webp'] }, { env: {}, fetchImpl })

    expect(calls).toEqual([])
    expect(out.purged).toBe(false)
    expect(out.results.map((r) => [r.backend, r.status])).toEqual([
      ['vercel-tags', 'unconfigured'],
      ['vercel-src-images', 'unconfigured'],
      ['cloudflare', 'unconfigured'],
    ])
  })

  it('invalidates Vercel by tag and by source image with the project in the query and a bearer token', async () => {
    const { calls, fetchImpl } = fetchStub()
    const out = await purgeImageCache(
      { keys: ['products/a.webp'] },
      {
        env: { VERCEL_API_TOKEN: 'tok', VERCEL_PROJECT_ID: 'prj_1', VERCEL_TEAM_ID: 'team_1' },
        fetchImpl,
      },
    )

    expect(out.purged).toBe(true)
    expect(calls).toHaveLength(2)
    const [tags, src] = calls as [Call, Call]
    expect(tags.url).toBe(
      'https://api.vercel.com/v1/edge-cache/invalidate-by-tags?projectIdOrName=prj_1&teamId=team_1',
    )
    expect(new Headers(tags.init.headers).get('authorization')).toBe('Bearer tok')
    expect(body(tags)).toEqual({ tags: ['image:products%2Fa.webp'], target: 'production' })
    expect(src.url).toContain('/v1/edge-cache/invalidate-by-src-images?projectIdOrName=prj_1')
    expect(body(src)).toEqual({
      srcImages: ['/images/r2/products/a.webp', '/images/products/a.webp'],
    })
    expect(out.results.find((r) => r.backend === 'cloudflare')?.status).toBe('unconfigured')
  })

  it('batches 16 tags per Vercel call', async () => {
    const { calls, fetchImpl } = fetchStub()
    const keys = Array.from({ length: 20 }, (_, i) => `products/${i}.webp`)
    await purgeImageCache(
      { keys },
      { env: { VERCEL_API_TOKEN: 'tok', VERCEL_PROJECT_ID: 'prj_1' }, fetchImpl },
    )
    const tagCalls = calls.filter((c) => c.url.includes('invalidate-by-tags'))
    expect(tagCalls.map((c) => (body(c).tags as string[]).length)).toEqual([16, 4])
  })

  it('purges Cloudflare by URL when the bucket has a public domain in a purgeable zone', async () => {
    const { calls, fetchImpl } = fetchStub()
    const out = await purgeImageCache(
      { keys: ['products/a.webp'] },
      {
        env: {
          CLOUDFLARE_API_TOKEN: 'cf',
          CLOUDFLARE_ZONE_ID: 'zone1',
          R2_PUBLIC_BASE_URL: 'https://cdn.kenyonexpress.co.il',
        },
        fetchImpl,
      },
    )
    expect(calls).toHaveLength(1)
    const [cf] = calls as [Call]
    expect(cf.url).toBe('https://api.cloudflare.com/client/v4/zones/zone1/purge_cache')
    expect(body(cf)).toEqual({ files: ['https://cdn.kenyonexpress.co.il/products/a.webp'] })
    expect(out.purged).toBe(true)
  })

  it('reports a backend failure with its status and does not throw', async () => {
    const { fetchImpl } = fetchStub(403)
    const out = await purgeImageCache(
      { keys: ['products/a.webp'] },
      { env: { VERCEL_API_TOKEN: 'bad', VERCEL_PROJECT_ID: 'prj_1' }, fetchImpl },
    )
    const vercel = out.results.find((r) => r.backend === 'vercel-tags')
    expect(vercel).toMatchObject({ ok: false, status: 403, detail: 'nope' })
    expect(out.purged).toBe(false)
  })

  it('`all` sends the one site tag and no source images or URLs', async () => {
    const { calls, fetchImpl } = fetchStub()
    const out = await purgeImageCache(
      { keys: [], all: true },
      {
        env: {
          VERCEL_API_TOKEN: 'tok',
          VERCEL_PROJECT_ID: 'prj_1',
          CLOUDFLARE_API_TOKEN: 'cf',
          CLOUDFLARE_ZONE_ID: 'z',
          R2_PUBLIC_BASE_URL: 'https://cdn.example.com',
        },
        fetchImpl,
      },
    )
    expect(calls).toHaveLength(1)
    expect(body(calls[0] as Call)).toEqual({ tags: ['images'], target: 'production' })
    expect(out.srcImages).toEqual([])
    expect(out.urls).toEqual([])
  })
})
