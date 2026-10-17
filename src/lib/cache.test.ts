import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CacheTag } from './cache'
import {
  buildCachePaths,
  buildCacheTags,
  getCacheControl,
  getCacheStatusHeader,
  parseXCacheStatus,
  purgeCacheForResource,
  sendCachePurgeRequest,
} from './cache'

describe('cache utilities', () => {
  describe('buildCacheTags', () => {
    it('builds product cache tag', () => {
      const tag = buildCacheTags('product', 123)
      expect(tag).toEqual({ resource: 'product', id: 123 })
    })

    it('builds category cache tag', () => {
      const tag = buildCacheTags('category', 'electronics')
      expect(tag).toEqual({ resource: 'category', id: 'electronics' })
    })

    it('builds order cache tag', () => {
      const tag = buildCacheTags('order', 'ord-456')
      expect(tag).toEqual({ resource: 'order', id: 'ord-456' })
    })

    it('builds coupon cache tag', () => {
      const tag = buildCacheTags('coupon', 'coup-789')
      expect(tag).toEqual({ resource: 'coupon', id: 'coup-789' })
    })

    it('builds supplier cache tag', () => {
      const tag = buildCacheTags('supplier', 42)
      expect(tag).toEqual({ resource: 'supplier', id: 42 })
    })

    it('throws on unknown resource', () => {
      expect(() => buildCacheTags('unknown', 1)).toThrow('Unknown cache resource: unknown')
    })
  })

  describe('buildCachePaths', () => {
    it('builds product cache paths', () => {
      const tag: CacheTag = { resource: 'product', id: 123 }
      const paths = buildCachePaths(tag)
      expect(paths).toContain('/product/:slug')
      expect(paths).toContain('/api/products/123')
      expect(paths).toContain('/api/shop/products')
    })

    it('builds category cache paths', () => {
      const tag: CacheTag = { resource: 'category', id: 'electronics' }
      const paths = buildCachePaths(tag)
      expect(paths).toContain('/shop/:category')
      expect(paths).toContain('/api/categories/electronics')
    })

    it('builds order cache paths', () => {
      const tag: CacheTag = { resource: 'order', id: 'ord-456' }
      const paths = buildCachePaths(tag)
      expect(paths).toContain('/account/orders/ord-456')
      expect(paths).toContain('/api/orders/ord-456')
    })

    it('builds coupon cache paths', () => {
      const tag: CacheTag = { resource: 'coupon', id: 'coup-789' }
      const paths = buildCachePaths(tag)
      expect(paths).toContain('/coupon/coup-789')
      expect(paths).toContain('/api/coupons/coup-789')
    })

    it('builds supplier cache paths', () => {
      const tag: CacheTag = { resource: 'supplier', id: 42 }
      const paths = buildCachePaths(tag)
      expect(paths).toContain('/suppliers')
      expect(paths).toContain('/api/suppliers/42')
    })
  })

  describe('sendCachePurgeRequest', () => {
    beforeEach(() => {
      vi.stubGlobal('fetch', vi.fn())
    })

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('sends cache purge request with valid tokens', async () => {
      process.env.VERCEL_TOKEN = 'test-token'
      process.env.VERCEL_PROJECT_ID = 'test-project'

      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
      })
      vi.stubGlobal('fetch', mockFetch)

      const tags: CacheTag[] = [{ resource: 'product', id: 123 }]
      await sendCachePurgeRequest(tags, ['/product/:slug'])

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.vercel.com/v1/projects/test-project/deployments/latest/purge',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
            'Content-Type': 'application/json',
          }),
        }),
      )

      vi.clearAllMocks()
      process.env.VERCEL_TOKEN = undefined
      process.env.VERCEL_PROJECT_ID = undefined
    })

    it('skips purge if VERCEL_TOKEN not set', async () => {
      process.env.VERCEL_TOKEN = undefined
      process.env.VERCEL_PROJECT_ID = 'test-project'

      const mockFetch = vi.fn()
      vi.stubGlobal('fetch', mockFetch)

      const tags: CacheTag[] = [{ resource: 'product', id: 123 }]
      await sendCachePurgeRequest(tags)

      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('skips purge if VERCEL_PROJECT_ID not set', async () => {
      process.env.VERCEL_TOKEN = 'test-token'
      process.env.VERCEL_PROJECT_ID = undefined

      const mockFetch = vi.fn()
      vi.stubGlobal('fetch', mockFetch)

      const tags: CacheTag[] = [{ resource: 'product', id: 123 }]
      await sendCachePurgeRequest(tags)

      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  describe('purgeCacheForResource', () => {
    beforeEach(() => {
      vi.stubGlobal('fetch', vi.fn())
    })

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('purges cache for product resource', async () => {
      process.env.VERCEL_TOKEN = 'test-token'
      process.env.VERCEL_PROJECT_ID = 'test-project'

      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
      })
      vi.stubGlobal('fetch', mockFetch)

      await purgeCacheForResource('product', 123)

      expect(mockFetch).toHaveBeenCalled()

      process.env.VERCEL_TOKEN = undefined
      process.env.VERCEL_PROJECT_ID = undefined
    })
  })

  describe('getCacheStatusHeader', () => {
    it('returns hit status header', () => {
      const header = getCacheStatusHeader('hit')
      expect(header).toHaveProperty('X-Cache-Status', 'hit')
      expect(header).toHaveProperty('X-Cache-Tag')
    })

    it('returns miss status header', () => {
      const header = getCacheStatusHeader('miss')
      expect(header).toHaveProperty('X-Cache-Status', 'miss')
    })

    it('returns dynamic status header', () => {
      const header = getCacheStatusHeader('dynamic')
      expect(header).toHaveProperty('X-Cache-Status', 'dynamic')
    })

    it('returns private status header', () => {
      const header = getCacheStatusHeader('private')
      expect(header).toHaveProperty('X-Cache-Status', 'private')
    })
  })

  describe('getCacheControl', () => {
    it('returns public cache control', () => {
      const control = getCacheControl(3600, 7200)
      expect(control['Cache-Control']).toBe('public, max-age=3600, s-maxage=7200')
    })

    it('returns public cache control with same max-age when sMaxAge not provided', () => {
      const control = getCacheControl(3600)
      expect(control['Cache-Control']).toBe('public, max-age=3600, s-maxage=3600')
    })

    it('returns private cache control', () => {
      const control = getCacheControl(3600, 7200, true)
      expect(control['Cache-Control']).toBe('private, max-age=3600, s-maxage=7200')
    })

    it('returns immutable cache control for long TTLs', () => {
      const control = getCacheControl(31536000)
      expect(control['Cache-Control']).toContain('max-age=31536000')
    })
  })

  describe('parseXCacheStatus', () => {
    it('parses X-Cache-Status header', () => {
      const status = parseXCacheStatus('hit')
      expect(status).toBe('hit')
    })

    it('returns unknown when header not provided', () => {
      const status = parseXCacheStatus()
      expect(status).toBe('unknown')
    })

    it('parses various status values', () => {
      expect(parseXCacheStatus('miss')).toBe('miss')
      expect(parseXCacheStatus('dynamic')).toBe('dynamic')
      expect(parseXCacheStatus('private')).toBe('private')
    })
  })
})
