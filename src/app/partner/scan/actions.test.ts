import { beforeEach, describe, expect, it, vi } from 'vitest'
import { redeemVoucherFromQr } from './actions'

// Mock dependencies
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/server/domain/vouchers/qr', () => ({
  verifyVoucherQrPayload: vi.fn(),
}))

vi.mock('@/server/domain/vouchers/scan-context', () => ({
  recordRefusedScan: vi.fn(),
}))

vi.mock('@/lib/utils/rate-limit', () => ({
  checkRateLimit: vi.fn(),
}))

vi.mock('next/headers', () => ({
  headers: vi.fn(() =>
    Promise.resolve({
      get: vi.fn((key: string) => {
        if (key === 'x-forwarded-for') return '127.0.0.1'
        if (key === 'user-agent') return 'test-agent'
        return null
      }),
    }),
  ),
}))

import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/utils/rate-limit'
import { verifyVoucherQrPayload } from '@/server/domain/vouchers/qr'
import { recordRefusedScan } from '@/server/domain/vouchers/scan-context'

describe('redeemVoucherFromQr', () => {
  const mockSupabase = {
    auth: {
      getUser: vi.fn(),
    },
    rpc: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(createClient).mockResolvedValue(mockSupabase as never)
    vi.mocked(checkRateLimit).mockResolvedValue(true)
  })

  describe('signature validation', () => {
    it('rejects invalid signature before DB access', async () => {
      vi.mocked(verifyVoucherQrPayload).mockReturnValue(null)

      const result = await redeemVoucherFromQr('KEV1.invalid.sig')

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toContain('קוד QR לא תקין')
      }
      expect(recordRefusedScan).toHaveBeenCalledWith(
        expect.objectContaining({
          outcome: 'invalid_signature',
          scanMethod: 'camera',
        }),
      )
      expect(mockSupabase.rpc).not.toHaveBeenCalled()
    })

    it('accepts valid signature', async () => {
      vi.mocked(verifyVoucherQrPayload).mockReturnValue({
        v: 1,
        c: 'ABCDE12345',
        s: 'supplier-id',
        u: 'user-id',
        e: Date.now() / 1000,
        k: 'v1',
      })
      vi.mocked(mockSupabase.auth.getUser).mockResolvedValue({
        data: { user: { id: 'user-123' } },
      } as never)
      vi.mocked(mockSupabase.rpc).mockResolvedValue({
        data: { outcome: 'success', code: 'ABCDE12345' },
        error: null,
      } as never)

      const result = await redeemVoucherFromQr('KEV1.valid.sig')

      expect(verifyVoucherQrPayload).toHaveBeenCalledWith('KEV1.valid.sig')
      expect(result.success).toBe(true)
    })
  })

  describe('redemption', () => {
    beforeEach(() => {
      vi.mocked(verifyVoucherQrPayload).mockReturnValue({
        v: 1,
        c: 'ABCDE12345',
        s: 'supplier-id',
        u: 'user-id',
        e: Date.now() / 1000,
        k: 'v1',
      })
      vi.mocked(mockSupabase.auth.getUser).mockResolvedValue({
        data: { user: { id: 'user-123' } },
      } as never)
    })

    it('marks redeemed_at via RPC and returns success', async () => {
      vi.mocked(mockSupabase.rpc).mockResolvedValue({
        data: {
          outcome: 'success',
          code: 'ABCDE12345',
          product_name: 'Test Product',
          customer_name: 'Test Customer',
          face_value_agorot: 10000,
          coupon_price_agorot: 5000,
          remaining_amount_due_agorot: 5000,
          redeemed_at: '2026-10-24T12:00:00Z',
        },
        error: null,
      } as never)

      const result = await redeemVoucherFromQr('KEV1.valid.sig')

      expect(mockSupabase.rpc).toHaveBeenCalledWith(
        'redeem_voucher',
        expect.objectContaining({
          p_code: 'ABCDE12345',
          p_scan_method: 'camera',
        }),
      )
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.voucher.code).toBe('ABCDE12345')
        expect(result.voucher.remainingAmountDueAgorot).toBe(5000)
        expect(result.voucher.redeemedAt).toBe('2026-10-24T12:00:00Z')
      }
    })

    it('uses stable idempotency key (user+code, not timestamp)', async () => {
      vi.mocked(mockSupabase.rpc).mockResolvedValue({
        data: { outcome: 'success', code: 'ABCDE12345' },
        error: null,
      } as never)

      await redeemVoucherFromQr('KEV1.valid.sig')

      const firstCall = vi.mocked(mockSupabase.rpc).mock.calls[0]
      expect(firstCall).toBeDefined()
      const firstKey = firstCall?.[1]?.p_idempotency_key

      // Call again with same inputs
      vi.mocked(mockSupabase.rpc).mockClear()
      await redeemVoucherFromQr('KEV1.valid.sig')

      const secondCall = vi.mocked(mockSupabase.rpc).mock.calls[0]
      expect(secondCall).toBeDefined()
      const secondKey = secondCall?.[1]?.p_idempotency_key

      // Keys MUST be identical for idempotency
      expect(firstKey).toBe(secondKey)
      expect(firstKey).toMatch(/^partner-scan:user-123:ABCDE12345$/)
      expect(firstKey).not.toContain('Date.now')
    })

    it('handles already_redeemed outcome', async () => {
      vi.mocked(mockSupabase.rpc).mockResolvedValue({
        data: {
          outcome: 'already_redeemed',
          redeemed_at: '2026-10-24T10:00:00Z',
        },
        error: null,
      } as never)

      const result = await redeemVoucherFromQr('KEV1.valid.sig')

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toContain('כבר מומש')
      }
    })

    it('handles expired outcome', async () => {
      vi.mocked(mockSupabase.rpc).mockResolvedValue({
        data: {
          outcome: 'expired',
          expires_at: '2026-10-20T00:00:00Z',
        },
        error: null,
      } as never)

      const result = await redeemVoucherFromQr('KEV1.valid.sig')

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toContain('תוקף')
      }
    })

    it('enforces rate limits', async () => {
      vi.mocked(checkRateLimit).mockResolvedValueOnce(false)

      const result = await redeemVoucherFromQr('KEV1.valid.sig')

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toContain('יותר מדי סריקות')
      }
      expect(mockSupabase.rpc).not.toHaveBeenCalled()
    })
  })

  describe('authorization', () => {
    beforeEach(() => {
      vi.mocked(verifyVoucherQrPayload).mockReturnValue({
        v: 1,
        c: 'ABCDE12345',
        s: 'supplier-id',
        u: 'user-id',
        e: Date.now() / 1000,
        k: 'v1',
      })
    })

    it('rejects unauthenticated requests', async () => {
      vi.mocked(mockSupabase.auth.getUser).mockResolvedValue({
        data: { user: null },
      } as never)

      const result = await redeemVoucherFromQr('KEV1.valid.sig')

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toContain('לא מורשה')
      }
      expect(mockSupabase.rpc).not.toHaveBeenCalled()
    })
  })
})
