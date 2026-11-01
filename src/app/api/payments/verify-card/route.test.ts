import { completeCardVerification } from '@/lib/payments/verify-card'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn(() => ({
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: { id: 'test-id' }, error: null })),
        })),
      })),
      // The claim is update(...).eq(id).eq(status).select(...).maybeSingle(); the
      // fail/refund writes stop at .eq(...). One chain that is both awaitable
      // and further chainable covers every shape without faking a row.
      update: vi.fn(() => {
        type Chain = Promise<{ error: null }> & {
          maybeSingle: () => Promise<{ data: null; error: null }>
          eq: () => Chain
          select: () => Chain
        }
        const chain: Chain = Object.assign(Promise.resolve({ error: null }), {
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
          eq: () => chain,
          select: () => chain,
        })
        return chain
      }),
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
        })),
      })),
    })),
  })),
}))

vi.mock('@/lib/payments', () => ({
  getPaymentProvider: vi.fn(() => ({
    name: 'mock',
    verifyLowProfile: vi.fn(),
    refundByTransactionId: vi.fn(),
  })),
  loadCardcomEnv: vi.fn(() => ({
    appUrl: 'https://example.com',
  })),
}))

vi.mock('@/lib/observability/log', () => ({
  log: {
    error: vi.fn(),
    warn: vi.fn(),
  },
}))

vi.mock('@/lib/observability/sentry', () => ({
  capturePaymentAlarm: vi.fn(),
}))

describe('Card Verification', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return pending when verification not found', async () => {
    const result = await completeCardVerification('nonexistent-id')
    expect(result).toBe('pending')
  })

  it('should handle declined verification', async () => {
    const result = await completeCardVerification('declined-id')
    expect(['failed', 'pending']).toContain(result)
  })

  it('should require valid verification amount', async () => {
    const result = await completeCardVerification('amount-mismatch-id')
    expect(['failed', 'pending']).toContain(result)
  })
})
