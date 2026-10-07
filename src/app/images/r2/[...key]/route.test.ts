import type { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const isR2ReadConfigured = vi.fn()
const getR2ImageObject = vi.fn()

vi.mock('@/lib/storage/r2-read', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/storage/r2-read')>()),
  isR2ReadConfigured: () => isR2ReadConfigured(),
  getR2ImageObject: (...args: unknown[]) => getR2ImageObject(...args),
}))

const { GET, HEAD } = await import('./route')

const request = (key: string, headers: Record<string, string> = {}, method = 'GET') =>
  new Request(`http://localhost/images/r2/${key}`, { method, headers }) as NextRequest
const context = (key: string) => ({ params: Promise.resolve({ key: key.split('/') }) })

const body = () =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('RIFF'))
      controller.close()
    },
  })

beforeEach(() => {
  vi.clearAllMocks()
  isR2ReadConfigured.mockReturnValue(true)
  getR2ImageObject.mockResolvedValue({
    status: 200,
    body: body(),
    contentType: 'image/webp',
    contentLength: 4,
    etag: '"abc"',
  })
})

describe('/images/r2/[...key]', () => {
  it('streams a promoted object with immutable caching and a sniff guard', async () => {
    const key = 'wp/ab/abcdef.card.webp'
    const res = await GET(request(key), context(key))

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/webp')
    expect(res.headers.get('cache-control')).toBe(
      'public, max-age=31536000, s-maxage=31536000, immutable',
    )
    expect(res.headers.get('vercel-cache-tag')).toBe(
      `images,images:wp,image:${encodeURIComponent(key)}`,
    )
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('etag')).toBe('"abc"')
    expect(res.headers.get('content-length')).toBe('4')
    await expect(res.text()).resolves.toBe('RIFF')
    expect(getR2ImageObject).toHaveBeenCalledWith(key, { ifNoneMatch: null, method: 'GET' })
  })

  it('caches a named (replaceable) key 30 days with stale-while-revalidate, tagged for purge', async () => {
    const key = 'products/b7.avif'
    const res = await GET(request(key), context(key))

    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe(
      'public, max-age=2592000, s-maxage=2592000, stale-while-revalidate=86400',
    )
    expect(res.headers.get('vercel-cache-tag')).toBe(
      'images,images:products,image:products%2Fb7.avif',
    )
  })

  it('refuses a key outside the promoted prefixes without touching the bucket', async () => {
    for (const key of ['secrets/x.webp', 'products/../wp/a.webp', 'products/a.svg', 'wp/a']) {
      const res = await GET(request(key), context(key))
      expect(res.status, key).toBe(404)
    }
    expect(getR2ImageObject).not.toHaveBeenCalled()
  })

  it('answers 404 with no-store when R2 is not configured, so a later deploy is not cached out', async () => {
    isR2ReadConfigured.mockReturnValue(false)
    const res = await GET(request('products/a.webp'), context('products/a.webp'))

    expect(res.status).toBe(404)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(getR2ImageObject).not.toHaveBeenCalled()
  })

  it('forwards If-None-Match and answers 304 without a body', async () => {
    getR2ImageObject.mockResolvedValue({ status: 304, etag: '"abc"' })
    const key = 'products/a.webp'
    const res = await GET(request(key, { 'if-none-match': '"abc"' }), context(key))

    expect(res.status).toBe(304)
    expect(res.headers.get('etag')).toBe('"abc"')
    expect(res.headers.get('cache-control')).toContain('max-age=2592000')
    expect(res.headers.get('vercel-cache-tag')).toContain('image:products%2Fa.webp')
    expect(getR2ImageObject).toHaveBeenCalledWith(key, { ifNoneMatch: '"abc"', method: 'GET' })
  })

  it('is a briefly cacheable 404 for a key the bucket does not hold', async () => {
    getR2ImageObject.mockResolvedValue({ status: 404 })
    const res = await GET(request('products/missing.webp'), context('products/missing.webp'))

    expect(res.status).toBe(404)
    expect(res.headers.get('cache-control')).toBe('public, max-age=60')
  })

  it('is a 502 with no-store, not a 404, when the bucket cannot be reached', async () => {
    getR2ImageObject.mockRejectedValue(new Error('AccessDenied'))
    const res = await GET(request('products/a.webp'), context('products/a.webp'))

    expect(res.status).toBe(502)
    expect(res.headers.get('cache-control')).toBe('no-store')
  })

  it('HEAD carries the headers and no body', async () => {
    getR2ImageObject.mockResolvedValue({
      status: 200,
      body: null,
      contentType: 'image/avif',
      contentLength: 10,
      etag: null,
    })
    const key = 'products/b7.avif'
    const res = await HEAD(request(key, {}, 'HEAD'), context(key))

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/avif')
    expect(res.headers.get('content-length')).toBe('10')
    expect(res.headers.has('etag')).toBe(false)
    expect(res.body).toBeNull()
    expect(getR2ImageObject).toHaveBeenCalledWith(key, { ifNoneMatch: null, method: 'HEAD' })
  })
})
