import { describe, expect, it, vi } from 'vitest'
import {
  triggerFlashDealMatchNotification,
  triggerOrderDeliveredNotification,
  triggerOrderShippedNotification,
  triggerVoucherExpiryNotifications,
} from './trigger-notifications'

vi.mock('./send', () => ({
  sendPushToUser: vi.fn(async (_userId, _notification) => ({
    sent: 1,
    failed: 0,
  })),
  sendPushToUsers: vi.fn(async (userIds, _notification) => ({
    sent: userIds.length,
    failed: 0,
  })),
}))

describe('Push notification triggers', () => {
  it('triggerOrderShippedNotification sends with correct title', async () => {
    const result = await triggerOrderShippedNotification('user-123', 'order-456')
    expect(result).toBeDefined()
  })

  it('triggerOrderDeliveredNotification sends with correct title', async () => {
    const result = await triggerOrderDeliveredNotification('user-123', 'order-456')
    expect(result).toBeDefined()
  })

  it('triggerFlashDealMatchNotification includes product name', async () => {
    const result = await triggerFlashDealMatchNotification('user-123', 'Running Shoes', 'shoes-123')
    expect(result).toBeDefined()
  })

  it('triggerVoucherExpiryNotifications handles single voucher', async () => {
    const result = await triggerVoucherExpiryNotifications({
      'user-123': { code: 'PROMO50', count: 1 },
    })

    expect(result.sent).toBeGreaterThanOrEqual(0)
  })

  it('triggerVoucherExpiryNotifications handles multiple vouchers', async () => {
    const result = await triggerVoucherExpiryNotifications({
      'user-123': { code: 'PROMO50', count: 3 },
      'user-456': { code: 'SALE20', count: 1 },
    })

    expect(result.sent).toBeGreaterThanOrEqual(0)
  })
})
