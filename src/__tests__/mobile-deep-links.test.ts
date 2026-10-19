import { APP_PATHS } from '@/lib/app/deep-links'
import { pathFromNotification } from '@/lib/push/deep-links'
import { describe, expect, it } from 'vitest'

type NotificationResponse = {
  notification: {
    request: {
      content: {
        data?: Record<string, unknown>
      }
    }
  }
}

const APP_SCHEME = 'kenyonexpress'

describe('Mobile Deep-Link Routing', () => {
  describe('pathFromNotification', () => {
    it('extracts path from notification data', () => {
      const notification = {
        notification: {
          request: {
            content: {
              data: { path: '/coupons' },
            },
          },
        },
      } as NotificationResponse

      expect(pathFromNotification(notification)).toBe('/coupons')
    })

    it('handles coupon detail links', () => {
      const notification = {
        notification: {
          request: {
            content: {
              data: { path: '/coupons/v1' },
            },
          },
        },
      } as NotificationResponse

      expect(pathFromNotification(notification)).toBe('/coupons/v1')
    })

    it('handles order links', () => {
      const notification = {
        notification: {
          request: {
            content: {
              data: { path: '/orders/o1' },
            },
          },
        },
      } as NotificationResponse

      expect(pathFromNotification(notification)).toBe('/orders/o1')
    })

    it('handles product links', () => {
      const notification = {
        notification: {
          request: {
            content: {
              data: { path: '/product/test-product' },
            },
          },
        },
      } as NotificationResponse

      expect(pathFromNotification(notification)).toBe('/product/test-product')
    })

    it('handles wallet links', () => {
      const notification = {
        notification: {
          request: {
            content: {
              data: { path: '/wallet' },
            },
          },
        },
      } as NotificationResponse

      expect(pathFromNotification(notification)).toBe('/wallet')
    })

    it('handles notification history links', () => {
      const notification = {
        notification: {
          request: {
            content: {
              data: { path: '/notifications' },
            },
          },
        },
      } as NotificationResponse

      expect(pathFromNotification(notification)).toBe('/notifications')
    })

    it('returns null for null response', () => {
      expect(pathFromNotification(null)).toBeNull()
    })

    it('returns null for missing data', () => {
      const notification = {
        notification: {
          request: {
            content: {
              data: {},
            },
          },
        },
      } as NotificationResponse

      expect(pathFromNotification(notification)).toBeNull()
    })

    it('rejects absolute URLs', () => {
      const notification = {
        notification: {
          request: {
            content: {
              data: { path: 'https://evil.com' },
            },
          },
        },
      } as NotificationResponse

      expect(pathFromNotification(notification)).toBeNull()
    })

    it('rejects protocol-relative URLs', () => {
      const notification = {
        notification: {
          request: {
            content: {
              data: { path: '//evil.com' },
            },
          },
        },
      } as NotificationResponse

      expect(pathFromNotification(notification)).toBeNull()
    })

    it('accepts valid app paths only', () => {
      expect(
        pathFromNotification({
          notification: {
            request: { content: { data: { path: '/' } } },
          },
        } as NotificationResponse),
      ).toBe('/')

      expect(
        pathFromNotification({
          notification: {
            request: { content: { data: { path: '/checkout/return' } } },
          },
        } as NotificationResponse),
      ).toBe('/checkout/return')
    })
  })

  describe('APP_PATHS completeness', () => {
    it('includes all required paths for notifications', () => {
      expect(APP_PATHS.home).toBe('/')
      expect(APP_PATHS.coupons).toBe('/coupons')
      expect(APP_PATHS.wallet).toBe('/wallet')
      expect(APP_PATHS.notifications).toBe('/notifications')
      expect(APP_PATHS.checkoutReturn).toBe('/checkout/return')
    })

    it('supports dynamic paths for items', () => {
      expect(APP_PATHS.coupon('v1')).toBe('/coupons/v1')
      expect(APP_PATHS.order('o1')).toBe('/orders/o1')
      expect(APP_PATHS.product('test-product')).toBe('/product/test-product')
    })
  })

  describe('APP_SCHEME configuration', () => {
    it('is set to kenyonexpress', () => {
      expect(APP_SCHEME).toBe('kenyonexpress')
    })
  })
})
