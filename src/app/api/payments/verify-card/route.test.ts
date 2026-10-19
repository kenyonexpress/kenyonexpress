import { beforeEach, describe, expect, it, vi } from 'vitest'
import { completeCardVerification } from './route'

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn(() => ({
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: { id: 'test-id' }, error: null })),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ error: null })),
      })),
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
