import { createPublicClient } from '@/lib/supabase/public'
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from './route'

vi.mock('@/lib/supabase/public')
vi.mock('@/lib/rate-limit/route-guard', () => ({ limitByIp: async () => null }))

describe('GET /api/mobile/products/[slug]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns product data when product exists', async () => {
    const mockProduct = {
      id: 'p1',
      slug: 'test-product',
      name_he: 'מוצר בדיקה',
      description_he: 'תיאור מוצר',
      price_agorot: 5000,
      image_url: 'https://example.com/image.jpg',
      supplier_id: 's1',
    }

    const mockChain = {
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: mockProduct,
        error: null,
      }),
    }

    const mockSelect = {
      eq: vi.fn().mockReturnValue(mockChain),
    }

    type MockClient = {
      from: ReturnType<typeof vi.fn>
    }
    const mockClient: MockClient = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue(mockSelect),
      }),
    }

    vi.mocked(createPublicClient).mockReturnValue(mockClient as any)

    const request = new NextRequest('http://localhost/api/mobile/products/test-product')
    const response = await GET(request, { params: Promise.resolve({ slug: 'test-product' }) })

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.slug).toBe('test-product')
    expect(data.name_he).toBe('מוצר בדיקה')
  })

  it('returns 404 when product not found', async () => {
    const mockChain = {
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Not found' },
      }),
    }

    const mockSelect = {
      eq: vi.fn().mockReturnValue(mockChain),
    }

    type MockClient = {
      from: ReturnType<typeof vi.fn>
    }
    const mockClient: MockClient = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue(mockSelect),
      }),
    }

    vi.mocked(createPublicClient).mockReturnValue(mockClient as any)

    const request = new NextRequest('http://localhost/api/mobile/products/nonexistent')
    const response = await GET(request, { params: Promise.resolve({ slug: 'nonexistent' }) })

    expect(response.status).toBe(404)
  })

  it('returns 400 for invalid slug', async () => {
    const request = new NextRequest('http://localhost/api/mobile/products/')
    const response = await GET(request, { params: Promise.resolve({ slug: '' }) })

    expect(response.status).toBe(400)
  })

  it('sets cache headers for product data', async () => {
    const mockProduct = {
      id: 'p1',
      slug: 'test-product',
      name_he: 'מוצר בדיקה',
      description_he: 'תיאור מוצר',
      price_agorot: 5000,
      image_url: 'https://example.com/image.jpg',
      supplier_id: 's1',
    }

    const mockChain = {
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: mockProduct,
        error: null,
      }),
    }

    const mockSelect = {
      eq: vi.fn().mockReturnValue(mockChain),
    }

    type MockClient = {
      from: ReturnType<typeof vi.fn>
    }
    const mockClient: MockClient = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue(mockSelect),
      }),
    }

    vi.mocked(createPublicClient).mockReturnValue(mockClient as any)

    const request = new NextRequest('http://localhost/api/mobile/products/test-product')
    const response = await GET(request, { params: Promise.resolve({ slug: 'test-product' }) })

    expect(response.headers.get('cache-control')).toBe('public, max-age=3600')
  })
})
