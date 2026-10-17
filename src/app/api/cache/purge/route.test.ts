import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { POST, GET } = await import('./route')

describe('Cache Purge API Route', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 'test-secret'
    process.env.VERCEL_TOKEN = 'test-token'
    process.env.VERCEL_PROJECT_ID = 'test-project'
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    process.env.CRON_SECRET = undefined
    process.env.VERCEL_TOKEN = undefined
    process.env.VERCEL_PROJECT_ID = undefined
    vi.unstubAllGlobals()
  })

  describe('POST /api/cache/purge', () => {
    it('returns 401 if no auth header provided', async () => {
      const request = new NextRequest('http://localhost:3000/api/cache/purge', {
        method: 'POST',
        body: JSON.stringify({ resource: 'product', id: 123 }),
      })

      const response = await POST(request)
      expect(response.status).toBe(401)

      const data = await response.json()
      expect(data.error).toBe('Unauthorized')
    })

    it('returns 401 if invalid auth header provided', async () => {
      const request = new NextRequest('http://localhost:3000/api/cache/purge', {
        method: 'POST',
        headers: { authorization: 'Bearer wrong-secret' },
        body: JSON.stringify({ resource: 'product', id: 123 }),
      })

      const response = await POST(request)
      expect(response.status).toBe(401)
    })

    it('returns 400 if neither resource nor tags provided', async () => {
      const request = new NextRequest('http://localhost:3000/api/cache/purge', {
        method: 'POST',
        headers: { authorization: 'Bearer test-secret' },
        body: JSON.stringify({}),
      })

      const response = await POST(request)
      expect(response.status).toBe(400)

      const data = await response.json()
      expect(data.error).toContain('Missing resource or tags')
    })

    it('purges cache for product resource with valid auth', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
      })
      vi.stubGlobal('fetch', mockFetch)

      const request = new NextRequest('http://localhost:3000/api/cache/purge', {
        method: 'POST',
        headers: { authorization: 'Bearer test-secret' },
        body: JSON.stringify({ resource: 'product', id: 123 }),
      })

      const response = await POST(request)
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.purged.tags).toEqual([{ resource: 'product', id: 123 }])
      expect(data.purged.paths).toContain('/product/:slug')
    })

    it('purges cache with custom tags and paths', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
      })
      vi.stubGlobal('fetch', mockFetch)

      const tags = [{ resource: 'product', id: 123 }]
      const paths = ['/product/test', '/api/products/123']

      const request = new NextRequest('http://localhost:3000/api/cache/purge', {
        method: 'POST',
        headers: { authorization: 'Bearer test-secret' },
        body: JSON.stringify({ tags, paths }),
      })

      const response = await POST(request)
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.purged.tags).toEqual(tags)
      expect(data.purged.paths).toEqual(paths)
    })

    it('handles fetch errors gracefully', async () => {
      const mockFetch = vi.fn().mockRejectedValueOnce(new Error('Network error'))
      vi.stubGlobal('fetch', mockFetch)

      const request = new NextRequest('http://localhost:3000/api/cache/purge', {
        method: 'POST',
        headers: { authorization: 'Bearer test-secret' },
        body: JSON.stringify({ resource: 'product', id: 123 }),
      })

      const response = await POST(request)
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.purged).toBeDefined()
    })
  })

  describe('GET /api/cache/purge', () => {
    it('returns health status without cron header', async () => {
      const request = new NextRequest('http://localhost:3000/api/cache/purge', {
        method: 'GET',
      })

      const response = await GET(request)
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.error).toBe('Health check - no cron header')
    })

    it('returns ready status with cron header', async () => {
      process.env.VERCEL_CDN_REGIONS = 'fra1,dub1'

      const request = new NextRequest('http://localhost:3000/api/cache/purge', {
        method: 'GET',
        headers: { 'x-vercel-cron': '1' },
      })

      const response = await GET(request)
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.status).toBe('ready')
      expect(data.service).toBe('cache-purge-endpoint')
      expect(data.regions).toEqual(['fra1', 'dub1'])
      expect(data.timestamp).toBeDefined()
    })

    it('returns default regions if env not set', async () => {
      process.env.VERCEL_CDN_REGIONS = undefined

      const request = new NextRequest('http://localhost:3000/api/cache/purge', {
        method: 'GET',
        headers: { 'x-vercel-cron': '1' },
      })

      const response = await GET(request)
      const data = await response.json()
      expect(data.regions).toEqual(['fra1'])
    })
  })
})
