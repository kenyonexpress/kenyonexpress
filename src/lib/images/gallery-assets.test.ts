import { describe, expect, it, vi } from 'vitest'
import { loadGalleryAssets, loadGalleryAssetsForProducts } from './gallery-assets'

vi.mock('@/lib/supabase/anon', () => ({
  createPublicClient: vi.fn(),
}))

vi.mock('@/lib/catalogue-read', () => ({
  orFail: vi.fn((response) => response?.data ?? response),
}))

import { createPublicClient } from '@/lib/supabase/anon'

const mockCreatePublicClient = createPublicClient as unknown as ReturnType<typeof vi.fn>

describe('gallery-assets utilities', () => {
  describe('loadGalleryAssets', () => {
    it('returns empty object for empty image array', async () => {
      const result = await loadGalleryAssets([])
      expect(result).toEqual({})
    })

    it('loads blur data and alt text for images', async () => {
      const mockSelect = vi.fn().mockReturnThis()
      const mockIn = vi.fn().mockResolvedValue({
        data: [
          {
            url: '/images/products/test1.jpg',
            alt_he: 'תמונה 1',
            blur_data_url: 'data:image/webp;base64,abc123',
          },
          {
            url: '/images/products/test2.jpg',
            alt_he: 'תמונה 2',
            blur_data_url: 'data:image/webp;base64,def456',
          },
        ],
        error: null,
      })

      mockSelect.mockImplementation(() => ({
        in: mockIn,
      }))

      mockCreatePublicClient.mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: mockSelect,
        }),
      })

      const result = await loadGalleryAssets([
        '/images/products/test1.jpg',
        '/images/products/test2.jpg',
      ])

      expect(result).toEqual({
        '/images/products/test1.jpg': {
          alt: 'תמונה 1',
          blurDataURL: 'data:image/webp;base64,abc123',
        },
        '/images/products/test2.jpg': {
          alt: 'תמונה 2',
          blurDataURL: 'data:image/webp;base64,def456',
        },
      })
    })

    it('handles missing alt text with null', async () => {
      const mockSelect = vi.fn().mockReturnThis()
      const mockIn = vi.fn().mockResolvedValue({
        data: [
          {
            url: '/images/products/test.jpg',
            alt_he: null,
            blur_data_url: 'data:image/webp;base64,xyz789',
          },
        ],
        error: null,
      })

      mockSelect.mockImplementation(() => ({
        in: mockIn,
      }))

      mockCreatePublicClient.mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: mockSelect,
        }),
      })

      const result = await loadGalleryAssets(['/images/products/test.jpg'])

      expect(result['/images/products/test.jpg']).toEqual({
        alt: null,
        blurDataURL: 'data:image/webp;base64,xyz789',
      })
    })

    it('handles missing blur data with null', async () => {
      const mockSelect = vi.fn().mockReturnThis()
      const mockIn = vi.fn().mockResolvedValue({
        data: [
          {
            url: '/images/products/test.jpg',
            alt_he: 'Test',
            blur_data_url: null,
          },
        ],
        error: null,
      })

      mockSelect.mockImplementation(() => ({
        in: mockIn,
      }))

      mockCreatePublicClient.mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: mockSelect,
        }),
      })

      const result = await loadGalleryAssets(['/images/products/test.jpg'])

      expect(result['/images/products/test.jpg']).toEqual({
        alt: 'Test',
        blurDataURL: null,
      })
    })
  })

  describe('loadGalleryAssetsForProducts', () => {
    it('extracts unique image URLs from products', async () => {
      const mockSelect = vi.fn().mockReturnThis()
      const mockIn = vi.fn().mockResolvedValue({
        data: [
          {
            url: '/img1.jpg',
            alt_he: 'Alt 1',
            blur_data_url: 'data:image/webp;base64,1',
          },
          {
            url: '/img2.jpg',
            alt_he: 'Alt 2',
            blur_data_url: 'data:image/webp;base64,2',
          },
        ],
        error: null,
      })

      mockSelect.mockImplementation(() => ({
        in: mockIn,
      }))

      mockCreatePublicClient.mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: mockSelect,
        }),
      })

      const products = [
        {
          id: '1',
          images: ['/img1.jpg', '/img2.jpg'],
        },
        {
          id: '2',
          images: ['/img1.jpg', '/img3.jpg'], // /img1.jpg is duplicate
        },
      ]

      const result = await loadGalleryAssetsForProducts(products)

      // Verify it called with unique URLs only
      expect(mockIn).toHaveBeenCalledWith('url', expect.arrayContaining(['/img1.jpg', '/img2.jpg']))

      expect(result).toHaveProperty('/img1.jpg')
      expect(result).toHaveProperty('/img2.jpg')
    })

    it('handles products with non-string images gracefully', async () => {
      const mockSelect = vi.fn().mockReturnThis()
      const mockIn = vi.fn().mockResolvedValue({
        data: [
          {
            url: '/string-img.jpg',
            alt_he: 'String Image',
            blur_data_url: 'data:image/webp;base64,test',
          },
        ],
        error: null,
      })

      mockSelect.mockImplementation(() => ({
        in: mockIn,
      }))

      mockCreatePublicClient.mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: mockSelect,
        }),
      })

      const products = [
        {
          id: '1',
          images: ['/string-img.jpg', { url: '/object-img.jpg' }, 123], // mixed types
        },
      ]

      const result = await loadGalleryAssetsForProducts(products)

      // Should only extract the string URL
      expect(mockIn).toHaveBeenCalledWith('url', expect.arrayContaining(['/string-img.jpg']))
      expect(mockIn).not.toHaveBeenCalledWith('url', expect.arrayContaining(['/object-img.jpg']))

      expect(result).toHaveProperty('/string-img.jpg')
    })

    it('handles products with empty images array', async () => {
      const mockSelect = vi.fn().mockReturnThis()
      const mockIn = vi.fn().mockResolvedValue({
        data: [],
        error: null,
      })

      mockSelect.mockImplementation(() => ({
        in: mockIn,
      }))

      mockCreatePublicClient.mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: mockSelect,
        }),
      })

      const products = [
        {
          id: '1',
          images: [],
        },
        {
          id: '2',
          images: [],
        },
      ]

      const result = await loadGalleryAssetsForProducts(products)

      expect(result).toEqual({})
    })

    it('handles products without images property', async () => {
      const mockSelect = vi.fn().mockReturnThis()
      const mockIn = vi.fn().mockResolvedValue({
        data: [],
        error: null,
      })

      mockSelect.mockImplementation(() => ({
        in: mockIn,
      }))

      mockCreatePublicClient.mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: mockSelect,
        }),
      })

      const products = [
        {
          id: '1',
          // no images property
          images: undefined,
        },
      ]

      const result = await loadGalleryAssetsForProducts(
        products as unknown as Array<{ images: unknown }>,
      )

      expect(result).toEqual({})
    })

    it('returns assets keyed by image URL', async () => {
      const mockSelect = vi.fn().mockReturnThis()
      const mockIn = vi.fn().mockResolvedValue({
        data: [
          {
            url: '/images/prod-a.jpg',
            alt_he: 'Product A',
            blur_data_url: 'data:image/webp;base64,aaa',
          },
        ],
        error: null,
      })

      mockSelect.mockImplementation(() => ({
        in: mockIn,
      }))

      mockCreatePublicClient.mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: mockSelect,
        }),
      })

      const products = [
        {
          id: 'prod1',
          images: ['/images/prod-a.jpg'],
        },
      ]

      const result = await loadGalleryAssetsForProducts(products)

      const asset = result['/images/prod-a.jpg']
      expect(asset).toBeDefined()
      if (asset) {
        expect(asset.alt).toBe('Product A')
        expect(asset.blurDataURL).toBe('data:image/webp;base64,aaa')
      }
    })
  })
})
