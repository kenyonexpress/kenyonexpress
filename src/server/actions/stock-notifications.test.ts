import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  subscribeToStockNotification,
  unsubscribeFromStockNotification,
  getStockNotifications,
} from './stock-notifications'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(),
    },
    from: vi.fn(),
  })),
}))

vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
}))

vi.mock('@/lib/logger', () => ({
  log: {
    error: vi.fn(),
    warn: vi.fn(),
  },
}))

describe('Stock Notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('subscribeToStockNotification', () => {
    it('should return error when user not authenticated', async () => {
      const { createClient } = await import('@/lib/supabase/server')
      vi.mocked(createClient).mockResolvedValueOnce({
        auth: {
          getUser: vi.fn().mockResolvedValueOnce({
            data: { user: null },
          }),
        } as any,
      } as any)

      const result = await subscribeToStockNotification('product-123')
      expect(result.success).toBe(false)
      expect(result.error).toBe('Not authenticated')
    })

    it('should return error when product not found', async () => {
      const { createClient } = await import('@/lib/supabase/server')
      const mockClient = {
        auth: {
          getUser: vi.fn().mockResolvedValueOnce({
            data: { user: { id: 'user-123', email: 'test@example.com' } },
          }),
        },
        from: vi.fn(() => ({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValueOnce({ data: null, error: null }),
            }),
          }),
        })),
      }

      vi.mocked(createClient).mockResolvedValueOnce(mockClient as any)

      const result = await subscribeToStockNotification('product-123')
      expect(result.success).toBe(false)
      expect(result.error).toBe('Product not found')
    })

    it('should handle duplicate subscription error', async () => {
      const { createClient } = await import('@/lib/supabase/server')
      const mockClient = {
        auth: {
          getUser: vi.fn().mockResolvedValueOnce({
            data: { user: { id: 'user-123', email: 'test@example.com' } },
          }),
        },
        from: vi
          .fn()
          .mockReturnValueOnce({
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValueOnce({ data: { stock_quantity: 5 }, error: null }),
              }),
            }),
          })
          .mockReturnValueOnce({
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValueOnce({
                  data: null,
                  error: { code: '23505', message: 'Duplicate' },
                }),
              }),
            }),
          }),
      }

      vi.mocked(createClient).mockResolvedValueOnce(mockClient as any)

      const result = await subscribeToStockNotification('product-123')
      expect(result.success).toBe(false)
      expect(result.error).toBe('Already subscribed to this product')
    })

    it('should successfully subscribe to notification', async () => {
      const { createClient } = await import('@/lib/supabase/server')
      const { revalidateTag } = await import('next/cache')

      const mockClient = {
        auth: {
          getUser: vi.fn().mockResolvedValueOnce({
            data: { user: { id: 'user-123', email: 'test@example.com' } },
          }),
        },
        from: vi
          .fn()
          .mockReturnValueOnce({
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValueOnce({ data: { stock_quantity: 0 }, error: null }),
              }),
            }),
          })
          .mockReturnValueOnce({
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValueOnce({
                  data: {
                    id: 'notification-123',
                    user_id: 'user-123',
                    product_id: 'product-123',
                  },
                  error: null,
                }),
              }),
            }),
          }),
      }

      vi.mocked(createClient).mockResolvedValueOnce(mockClient as any)

      const result = await subscribeToStockNotification('product-123')
      expect(result.success).toBe(true)
      expect(vi.mocked(revalidateTag)).toHaveBeenCalledWith('product_product-123')
    })
  })

  describe('unsubscribeFromStockNotification', () => {
    it('should return error when user not authenticated', async () => {
      const { createClient } = await import('@/lib/supabase/server')
      vi.mocked(createClient).mockResolvedValueOnce({
        auth: {
          getUser: vi.fn().mockResolvedValueOnce({
            data: { user: null },
          }),
        } as any,
      } as any)

      const result = await unsubscribeFromStockNotification('notification-123')
      expect(result.success).toBe(false)
      expect(result.error).toBe('Not authenticated')
    })

    it('should successfully unsubscribe', async () => {
      const { createClient } = await import('@/lib/supabase/server')
      const mockClient = {
        auth: {
          getUser: vi.fn().mockResolvedValueOnce({
            data: { user: { id: 'user-123' } },
          }),
        },
        from: vi.fn().mockReturnValue({
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValueOnce({ data: null, error: null }),
            }),
          }),
        }),
      }

      vi.mocked(createClient).mockResolvedValueOnce(mockClient as any)

      const result = await unsubscribeFromStockNotification('notification-123')
      expect(result.success).toBe(true)
    })
  })

  describe('getStockNotifications', () => {
    it('should return unsubscribed state for unauthenticated user', async () => {
      const { createClient } = await import('@/lib/supabase/server')
      vi.mocked(createClient).mockResolvedValueOnce({
        auth: {
          getUser: vi.fn().mockResolvedValueOnce({
            data: { user: null },
          }),
        } as any,
      } as any)

      const result = await getStockNotifications('product-123')
      expect(result.subscribed).toBe(false)
    })

    it('should return subscription status when authenticated', async () => {
      const { createClient } = await import('@/lib/supabase/server')
      const mockClient = {
        auth: {
          getUser: vi.fn().mockResolvedValueOnce({
            data: { user: { id: 'user-123' } },
          }),
        },
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnThis(),
            is: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValueOnce({
              data: { id: 'notification-123' },
              error: null,
            }),
          }),
        }),
      }

      vi.mocked(createClient).mockResolvedValueOnce(mockClient as any)

      const result = await getStockNotifications('product-123')
      expect(result.subscribed).toBe(true)
      expect(result.notificationId).toBe('notification-123')
    })
  })
})
