import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  scheduleExpiryReminders,
  scheduleGiftCoupon,
  schedulePurchaseConfirmation,
} from './scheduler'

// Mock the dependencies
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    rpc: vi.fn(),
  })),
}))

vi.mock('@/lib/observability/log', () => ({
  log: {
    error: vi.fn(),
  },
}))

describe('C20: Email scheduler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('scheduleExpiryReminders', () => {
    it('calls enqueue_expiring_voucher_notices with T-7 and T-1 buckets', async () => {
      const { createAdminClient } = await import('@/lib/supabase/admin')
      const mockRpc = vi.fn().mockResolvedValue({ data: 5, error: null })
      vi.mocked(createAdminClient).mockReturnValue({ rpc: mockRpc } as any)

      const result = await scheduleExpiryReminders()

      expect(mockRpc).toHaveBeenCalledWith('enqueue_expiring_voucher_notices', {
        p_buckets: [7, 1],
      })
      expect(result).toBe(5)
    })

    it('returns null and logs error on failure', async () => {
      const { createAdminClient } = await import('@/lib/supabase/admin')
      const { log } = await import('@/lib/observability/log')
      const mockRpc = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Database error' },
      })
      vi.mocked(createAdminClient).mockReturnValue({ rpc: mockRpc } as any)

      const result = await scheduleExpiryReminders()

      expect(result).toBeNull()
      expect(log.error).toHaveBeenCalledWith(
        'emails.expiry_reminders_schedule_failed',
        expect.objectContaining({
          reason: 'Database error',
          buckets: [7, 1],
        }),
      )
    })
  })

  describe('scheduleGiftCoupon', () => {
    it('queues gift email via fn_enqueue_notification', async () => {
      const { createAdminClient } = await import('@/lib/supabase/admin')
      const mockRpc = vi.fn().mockResolvedValue({ error: null })
      vi.mocked(createAdminClient).mockReturnValue({ rpc: mockRpc } as any)

      const result = await scheduleGiftCoupon('user-123', 'test@example.com', {
        product_name: 'ספא במלון',
        claim_token: 'TOKEN123',
        sender_name: 'דנה',
      })

      expect(mockRpc).toHaveBeenCalledWith('fn_enqueue_notification', {
        p_kind: 'voucher_gifted',
        p_recipient_email: 'test@example.com',
        p_dedupe_key: 'gift:TOKEN123',
        p_payload: {
          product_name: 'ספא במלון',
          claim_token: 'TOKEN123',
          sender_name: 'דנה',
        },
        p_user_id: 'user-123',
      })
      expect(result).toBe(true)
    })

    it('returns false and logs error on failure', async () => {
      const { createAdminClient } = await import('@/lib/supabase/admin')
      const { log } = await import('@/lib/observability/log')
      const mockRpc = vi.fn().mockResolvedValue({
        error: { message: 'Queue full' },
      })
      vi.mocked(createAdminClient).mockReturnValue({ rpc: mockRpc } as any)

      const result = await scheduleGiftCoupon(null, 'test@example.com', {
        claim_token: 'TOKEN123',
      })

      expect(result).toBe(false)
      expect(log.error).toHaveBeenCalledWith(
        'emails.gift_coupon_schedule_failed',
        expect.objectContaining({
          reason: 'Queue full',
          claim_token: 'TOKEN123',
        }),
      )
    })
  })

  describe('schedulePurchaseConfirmation', () => {
    it('queues purchase confirmation via fn_enqueue_notification', async () => {
      const { createAdminClient } = await import('@/lib/supabase/admin')
      const mockRpc = vi.fn().mockResolvedValue({ error: null })
      vi.mocked(createAdminClient).mockReturnValue({ rpc: mockRpc } as any)

      const result = await schedulePurchaseConfirmation('order-456', 'customer@example.com', {
        order_ref: 'KE-1234',
        customer_name: 'יוסי',
        total_agorot: 12900,
        item_count: 3,
      })

      expect(mockRpc).toHaveBeenCalledWith('fn_enqueue_notification', {
        p_kind: 'order_paid',
        p_recipient_email: 'customer@example.com',
        p_dedupe_key: 'order:order-456:confirmation',
        p_payload: {
          order_id: 'order-456',
          order_ref: 'KE-1234',
          customer_name: 'יוסי',
          total_agorot: 12900,
          item_count: 3,
        },
        p_user_id: null,
      })
      expect(result).toBe(true)
    })

    it('returns false and logs error on failure', async () => {
      const { createAdminClient } = await import('@/lib/supabase/admin')
      const { log } = await import('@/lib/observability/log')
      const mockRpc = vi.fn().mockResolvedValue({
        error: { message: 'Invalid order' },
      })
      vi.mocked(createAdminClient).mockReturnValue({ rpc: mockRpc } as any)

      const result = await schedulePurchaseConfirmation('order-456', 'customer@example.com', {
        total_agorot: 12900,
      })

      expect(result).toBe(false)
      expect(log.error).toHaveBeenCalledWith(
        'emails.purchase_confirmation_schedule_failed',
        expect.objectContaining({
          reason: 'Invalid order',
          order_id: 'order-456',
        }),
      )
    })
  })

  describe('Integration with cron jobs', () => {
    it('scheduleExpiryReminders is used by /api/cron/expire-vouchers', async () => {
      // This test documents the integration point
      // The cron job at /api/cron/expire-vouchers calls scheduleExpiryReminders()
      // which queues T-7 and T-1 reminders via the database

      const { createAdminClient } = await import('@/lib/supabase/admin')
      const mockRpc = vi.fn().mockResolvedValue({ data: 12, error: null })
      vi.mocked(createAdminClient).mockReturnValue({ rpc: mockRpc } as any)

      const remindersQueued = await scheduleExpiryReminders()

      expect(remindersQueued).toBe(12)
      expect(mockRpc).toHaveBeenCalledWith('enqueue_expiring_voucher_notices', {
        p_buckets: [7, 1],
      })
    })
  })
})
