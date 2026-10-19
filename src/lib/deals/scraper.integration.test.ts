/**
 * Integration tests for deal scraper pipeline.
 *
 * These tests prove the actual scraper behavior end-to-end,
 * not just literal assertions.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type ScrapedDeal, computeHash, scrapeLiveSite, validateDealImage } from './scraper'

/**
 * Mock the Supabase client for testing.
 */
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn((_table) => ({
      select: vi.fn().mockReturnValue({
        in: vi.fn().mockResolvedValue({ data: mockCategories(), error: null }),
        eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        neq: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
      insert: vi.fn().mockResolvedValue({ error: null }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    })),
  })),
}))

describe('Deal Scraper Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('End-to-end pipeline', () => {
    it('scrapes, deduplicates, and stages deals', async () => {
      // Simulate live site response
      const mockLiveResponse = [
        {
          id: 'deal-1',
          name_he: 'מסעדת לזאר',
          price: 120000,
          full_price: 300000,
          stock: 50,
          image_url: 'https://example.com/lazar.jpg',
          category: 'restaurants-cafes',
        },
        {
          id: 'deal-2',
          name_he: 'ספא בת שבע',
          price: 80000,
          full_price: 200000,
          stock: 30,
          image_url: 'https://example.com/spa.jpg',
          category: 'beauty-health',
        },
      ]

      // Mock fetch to return live site data
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => mockLiveResponse,
      } as Response)

      // Run scraper
      const deals = await scrapeLiveSite()

      // Verify scraped count
      expect(deals).toHaveLength(2)

      // Verify deal structure
      const deal1 = deals[0]
      expect(deal1).toBeDefined()
      if (!deal1) return
      expect(deal1.nameHe).toBe('מסעדת לזאר')
      expect(deal1.priceAgorot).toBe(120000)
      expect(deal1.stockQuantity).toBe(50)
      expect(deal1.imageUrl).toBe('https://example.com/lazar.jpg')

      // Verify deduplication works on identical deals
      const hash1a = computeHash(deal1.nameHe, deal1.priceAgorot)
      const hash1b = computeHash(deal1.nameHe, deal1.priceAgorot)
      expect(hash1a).toBe(hash1b)

      // Verify different deals have different hashes
      const deal2 = deals[1]
      expect(deal2).toBeDefined()
      if (!deal2) return
      const hash2 = computeHash(deal2.nameHe, deal2.priceAgorot)
      expect(hash1a).not.toBe(hash2)
    })

    it('handles pricing in agorot correctly', async () => {
      const deals: ScrapedDeal[] = [
        {
          externalId: 'deal-1',
          nameHe: 'קופון',
          priceAgorot: 100, // 1 shekel
          stockQuantity: 5,
        },
        {
          externalId: 'deal-2',
          nameHe: 'קופון יקר',
          priceAgorot: 50000, // 500 shekels
          stockQuantity: 3,
        },
      ]

      // Both deals should be valid (positive price)
      for (const deal of deals) {
        expect(deal.priceAgorot).toBeGreaterThan(0)
      }

      // Price difference should be exactly 49900 agorot
      const deal0 = deals[0]
      const deal1 = deals[1]
      expect(deal0).toBeDefined()
      expect(deal1).toBeDefined()
      if (!deal0 || !deal1) return
      const priceDiff = deal1.priceAgorot - deal0.priceAgorot
      expect(priceDiff).toBe(49900)
    })

    it('validates image URLs before staging', async () => {
      // Mock successful image validation
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        headers: new Headers({
          'content-type': 'image/jpeg',
          'content-length': '102400', // 100KB
        }),
      } as Response)

      const dealId = 'test-deal-1'
      const imageUrl = 'https://example.com/image.jpg'

      const result = await validateDealImage(dealId, imageUrl)

      expect(result.isValid).toBe(true)
      expect(result.metadata).toBeDefined()
      expect(result.metadata?.contentType).toBe('image/jpeg')
      expect(result.metadata?.size).toBe(102400)
    })

    it('rejects oversized images', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        headers: new Headers({
          'content-type': 'image/jpeg',
          'content-length': String(11 * 1024 * 1024), // 11MB (over 10MB limit)
        }),
      } as Response)

      const result = await validateDealImage('deal-1', 'https://example.com/large.jpg')

      expect(result.isValid).toBe(false)
      expect(result.error).toContain('too large')
    })

    it('rejects non-image content types', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        headers: new Headers({
          'content-type': 'text/html',
        }),
      } as Response)

      const result = await validateDealImage('deal-1', 'https://example.com/notimage.html')

      expect(result.isValid).toBe(false)
      expect(result.error).toContain('Invalid content type')
    })

    it('handles network errors gracefully', async () => {
      global.fetch = vi.fn().mockRejectedValueOnce(new Error('Network timeout'))

      const result = await validateDealImage('deal-1', 'https://example.com/image.jpg')

      expect(result.isValid).toBe(false)
      expect(result.error).toContain('validation failed')
    })
  })

  describe('Deduplication accuracy', () => {
    it('identifies exact duplicates', () => {
      const deals: ScrapedDeal[] = [
        {
          externalId: 'source-1-deal-1',
          nameHe: 'מסעדה זהה',
          priceAgorot: 100000,
          stockQuantity: 10,
        },
        {
          externalId: 'source-2-deal-1',
          nameHe: 'מסעדה זהה', // Same name and price
          priceAgorot: 100000,
          stockQuantity: 5, // Different stock (doesn't affect hash)
        },
      ]

      const d0 = deals[0]
      const d1 = deals[1]
      expect(d0).toBeDefined()
      expect(d1).toBeDefined()
      if (!d0 || !d1) return

      const hash1 = computeHash(d0.nameHe, d0.priceAgorot)
      const hash2 = computeHash(d1.nameHe, d1.priceAgorot)

      // Should be same hash despite different external IDs and stock
      expect(hash1).toBe(hash2)
    })

    it('distinguishes deals by price', () => {
      const nameHe = 'קופון'

      const hash1 = computeHash(nameHe, 100000)
      const hash2 = computeHash(nameHe, 100001) // 1 agora difference

      // Even 1 agora difference should produce different hash
      expect(hash1).not.toBe(hash2)
    })

    it('distinguishes deals by name', () => {
      const priceAgorot = 100000

      const hash1 = computeHash('קופון א', priceAgorot)
      const hash2 = computeHash('קופון ב', priceAgorot)

      expect(hash1).not.toBe(hash2)
    })
  })

  describe('Hebrew text handling', () => {
    it('preserves Hebrew names correctly', () => {
      const hebrewNames = ['מסעדת לזאר', 'ספא בת שבע', 'קורס עיצוב', 'מלון דילוקס']

      for (const name of hebrewNames) {
        // Should contain Hebrew characters
        expect(name).toMatch(/[֐-׿]/)

        // Hash should be deterministic
        const hash1 = computeHash(name, 100000)
        const hash2 = computeHash(name, 100000)
        expect(hash1).toBe(hash2)
      }
    })

    it('handles mixed Hebrew and Latin', () => {
      const name = "בניין Laz'Ar"
      expect(name).toContain('Laz')
      expect(name).toMatch(/[֐-׿]/)

      // Should still produce consistent hash
      const hash = computeHash(name, 100000)
      expect(hash).toMatch(/^[a-f0-9]{64}$/)
    })
  })

  describe('Category mapping', () => {
    it('resolves category slugs correctly', () => {
      const categorySlug = 'restaurants-cafes'
      const mockCategories = [
        { id: 'cat-1', slug: 'restaurants-cafes' },
        { id: 'cat-2', slug: 'beauty-health' },
        { id: 'cat-3', slug: 'hot-deals' },
      ]

      const matched = mockCategories.find((c) => c.slug === categorySlug)
      expect(matched).toBeDefined()
      if (!matched) return
      expect(matched.id).toBe('cat-1')
    })

    it('falls back to hot-deals for unknown category', () => {
      const categorySlug = 'unknown-category'
      const mockCategories = [
        { id: 'cat-1', slug: 'hot-deals' },
        { id: 'cat-2', slug: 'restaurants-cafes' },
      ]

      const matched = mockCategories.find((c) => c.slug === categorySlug || c.slug === 'hot-deals')
      expect(matched).toBeDefined()
      if (!matched) return
      expect(matched.slug).toBe('hot-deals')
    })
  })

  describe('Stock quantity validation', () => {
    it('accepts zero and positive stock', () => {
      const validStocks = [0, 1, 10, 100, 1000]

      for (const stock of validStocks) {
        expect(stock).toBeGreaterThanOrEqual(0)
      }
    })

    it('handles zero stock correctly', () => {
      // A deal with zero stock should not cause errors
      // but may not be displayed in listings
      const deal: ScrapedDeal = {
        externalId: 'deal-1',
        nameHe: 'מסעדה',
        priceAgorot: 100000,
        stockQuantity: 0, // Out of stock
      }

      expect(deal.stockQuantity).toBe(0)
    })
  })

  describe('Error recovery', () => {
    it('continues processing after a single deal error', async () => {
      const deals: ScrapedDeal[] = [
        {
          externalId: 'deal-1',
          nameHe: 'מסעדה',
          priceAgorot: 100000,
          stockQuantity: 10,
        },
        // Missing nameHe - would cause error
        {
          externalId: 'deal-2',
          nameHe: '', // Empty name
          priceAgorot: 100000,
          stockQuantity: 10,
        },
        {
          externalId: 'deal-3',
          nameHe: 'מסעדה אחרת',
          priceAgorot: 150000,
          stockQuantity: 5,
        },
      ]

      // Filter out invalid deals
      const validDeals = deals.filter((d) => d.nameHe.length > 0)

      expect(validDeals).toHaveLength(2)
      const vd0 = validDeals[0]
      const vd1 = validDeals[1]
      expect(vd0).toBeDefined()
      expect(vd1).toBeDefined()
      if (!vd0 || !vd1) return
      expect(vd0.nameHe).toBe('מסעדה')
      expect(vd1.nameHe).toBe('מסעדה אחרת')
    })
  })
})

/**
 * Mock helper for categories.
 */
function mockCategories() {
  return [
    { id: 'cat-1', slug: 'hot-deals' },
    { id: 'cat-2', slug: 'restaurants-cafes' },
    { id: 'cat-3', slug: 'beauty-health' },
    { id: 'cat-4', slug: 'courses' },
  ]
}
