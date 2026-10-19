import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { meiliHealthCheck, meiliRequest, meiliSearch } from './meili-request'

// Mock fetch to avoid actual HTTP calls
global.fetch = vi.fn()

describe('meili-request', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('meiliRequest', () => {
    it('throws when Meilisearch is not configured', async () => {
      vi.stubEnv('MEILISEARCH_HOST', '')
      vi.stubEnv('MEILISEARCH_API_KEY', '')
      await expect(meiliRequest('/test', 'GET')).rejects.toThrow('meilisearch not configured')
    })

    it('makes a GET request with proper headers', async () => {
      process.env.MEILISEARCH_HOST = 'http://localhost:7700'
      process.env.MEILISEARCH_API_KEY = 'test-key'

      const mockResponse = { ok: true, json: vi.fn().mockResolvedValue({ results: [] }) }
      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any)

      await meiliRequest('/health', 'GET')

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:7700/health',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-key',
          }),
          cache: 'no-store',
        }),
      )
    })

    it('throws on HTTP error with extracted error code', async () => {
      process.env.MEILISEARCH_HOST = 'http://localhost:7700'
      process.env.MEILISEARCH_API_KEY = 'test-key'

      const mockResponse = {
        ok: false,
        status: 404,
        json: vi.fn().mockResolvedValue({
          errors: [{ code: 'index_not_found', message: 'Index not found' }],
        }),
      }
      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any)

      await expect(meiliRequest('/indexes/products/search', 'POST')).rejects.toThrow(
        'index_not_found',
      )
    })

    it('handles POST request with body', async () => {
      process.env.MEILISEARCH_HOST = 'http://localhost:7700'
      process.env.MEILISEARCH_API_KEY = 'test-key'

      const mockResponse = { ok: true, json: vi.fn().mockResolvedValue({ hits: [] }) }
      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any)

      const body = { q: 'test', limit: 10 }
      await meiliRequest('/indexes/products/search', 'POST', body)

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:7700/indexes/products/search',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(body),
        }),
      )
    })
  })

  describe('meiliSearch', () => {
    it('returns null on error instead of throwing', async () => {
      process.env.MEILISEARCH_HOST = 'http://localhost:7700'
      process.env.MEILISEARCH_API_KEY = 'test-key'

      const mockResponse = {
        ok: false,
        status: 500,
        json: vi.fn().mockResolvedValue({ code: 'internal_error', message: 'Server error' }),
      }
      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any)

      const result = await meiliSearch('/indexes/products/search', 'POST')
      expect(result).toBeNull()
    })

    it('returns data on success', async () => {
      process.env.MEILISEARCH_HOST = 'http://localhost:7700'
      process.env.MEILISEARCH_API_KEY = 'test-key'

      const data = { hits: [{ id: '1', name_he: 'Test' }], estimatedTotalHits: 1 }
      const mockResponse = { ok: true, json: vi.fn().mockResolvedValue(data) }
      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any)

      const result = await meiliSearch('/indexes/products/search', 'POST')
      expect(result).toEqual(data)
    })
  })

  describe('meiliHealthCheck', () => {
    it('returns not_configured when env vars are missing', async () => {
      vi.stubEnv('MEILISEARCH_HOST', '')
      vi.stubEnv('MEILISEARCH_API_KEY', '')
      const result = await meiliHealthCheck()
      expect(result).toEqual({ ok: false, code: 'not_configured' })
    })

    it('checks health endpoint and search index', async () => {
      process.env.MEILISEARCH_HOST = 'http://localhost:7700'
      process.env.MEILISEARCH_API_KEY = 'test-key'

      const healthResponse = { ok: true, json: vi.fn() }
      const searchResponse = { ok: true, json: vi.fn().mockResolvedValue({ hits: [] }) }

      vi.mocked(global.fetch)
        .mockResolvedValueOnce(healthResponse as any)
        .mockResolvedValueOnce(searchResponse as any)

      const result = await meiliHealthCheck()

      expect(result).toEqual({ ok: true })
      expect(global.fetch).toHaveBeenCalledTimes(2)
      // First call to /health
      expect(global.fetch).toHaveBeenNthCalledWith(
        1,
        'http://localhost:7700/health',
        expect.any(Object),
      )
      // Second call to search
      expect(global.fetch).toHaveBeenNthCalledWith(
        2,
        'http://localhost:7700/indexes/products/search',
        expect.any(Object),
      )
    })

    it('returns error code when health check fails', async () => {
      process.env.MEILISEARCH_HOST = 'http://localhost:7700'
      process.env.MEILISEARCH_API_KEY = 'test-key'

      const healthResponse = {
        ok: false,
        status: 403,
        json: vi.fn().mockResolvedValue({ code: 'invalid_api_key', message: 'Invalid key' }),
      }
      vi.mocked(global.fetch).mockResolvedValue(healthResponse as any)

      const result = await meiliHealthCheck()

      expect(result).toEqual({ ok: false, code: 'invalid_api_key' })
    })

    it('returns error code when search index fails', async () => {
      process.env.MEILISEARCH_HOST = 'http://localhost:7700'
      process.env.MEILISEARCH_API_KEY = 'test-key'

      const healthResponse = { ok: true, json: vi.fn() }
      const searchResponse = {
        ok: false,
        status: 404,
        json: vi
          .fn()
          .mockResolvedValue({ errors: [{ code: 'index_not_found', message: 'Not found' }] }),
      }

      vi.mocked(global.fetch)
        .mockResolvedValueOnce(healthResponse as any)
        .mockResolvedValueOnce(searchResponse as any)

      const result = await meiliHealthCheck()

      expect(result).toEqual({ ok: false, code: 'index_not_found' })
    })
  })
})
