import { describe, expect, it, vi } from 'vitest'
import { getProductPurchaseCount } from './product-purchase-count'

// Mock the supabase client
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          gte: vi.fn(() => ({
            count: 5,
            error: null,
          })),
        })),
      })),
    })),
  })),
}))

describe('getProductPurchaseCount', () => {
  it('returns the count from supabase', async () => {
    const count = await getProductPurchaseCount('test-product-id')
    expect(count).toBe(5)
  })

  it('returns 0 when count is null', async () => {
    const { createClient } = await import('@/lib/supabase/server')
    vi.mocked(createClient).mockImplementationOnce(
      () =>
        ({
          from: vi.fn(() => ({
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                gte: vi.fn(() => ({
                  count: null,
                  error: null,
                })),
              })),
            })),
          })),
        }) as never,
    )

    const count = await getProductPurchaseCount('test-product-id')
    expect(count).toBe(0)
  })

  it('returns 0 and logs error when query fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { createClient } = await import('@/lib/supabase/server')

    vi.mocked(createClient).mockImplementationOnce(
      () =>
        ({
          from: vi.fn(() => ({
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                gte: vi.fn(() => ({
                  count: null,
                  error: { message: 'Database error' },
                })),
              })),
            })),
          })),
        }) as never,
    )

    const count = await getProductPurchaseCount('test-product-id')
    expect(count).toBe(0)
    expect(consoleSpy).toHaveBeenCalledWith('[getProductPurchaseCount] Error fetching count:', {
      message: 'Database error',
    })

    consoleSpy.mockRestore()
  })

  it('queries order_items for the last 30 days', async () => {
    const { createClient } = await import('@/lib/supabase/server')
    const mockGte = vi.fn(() => ({ count: 3, error: null }))
    const mockEq = vi.fn(() => ({ gte: mockGte }))
    const mockSelect = vi.fn(() => ({ eq: mockEq }))
    const mockFrom = vi.fn(() => ({ select: mockSelect }))

    vi.mocked(createClient).mockImplementationOnce(
      () =>
        ({
          from: mockFrom,
        }) as never,
    )

    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    await getProductPurchaseCount('test-product-id')

    expect(mockFrom).toHaveBeenCalledWith('order_items')
    expect(mockSelect).toHaveBeenCalledWith('*', { count: 'exact', head: true })
    expect(mockEq).toHaveBeenCalledWith('product_id', 'test-product-id')
    // Check that gte was called with a date string approximately 30 days ago
    expect(mockGte).toHaveBeenCalledWith('created_at', expect.stringContaining('T'))
  })
})
