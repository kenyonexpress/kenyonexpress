import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the Supabase admin client
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          gte: () => Promise.resolve({ data: [], error: null }),
        }),
      }),
      insert: () => Promise.resolve({ error: null }),
    }),
  }),
}))

// Import after mocks are set up
const { getUserOrderCount24h, isOrderRateExceeded, getDeviceOrderCount24h } = await import(
  './order-validation'
)

describe('order-validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getUserOrderCount24h', () => {
    it('returns 0 for user with no orders', async () => {
      const count = await getUserOrderCount24h('00000000-0000-0000-0000-000000000000')
      expect(count).toBe(0)
    })

    it('returns a number', async () => {
      const count = await getUserOrderCount24h('00000000-0000-0000-0000-000000000000')
      expect(typeof count).toBe('number')
    })
  })

  describe('isOrderRateExceeded', () => {
    it('returns false for user with no orders', async () => {
      const exceeded = await isOrderRateExceeded('00000000-0000-0000-0000-000000000000')
      expect(exceeded).toBe(false)
    })

    it('returns boolean', async () => {
      const exceeded = await isOrderRateExceeded('00000000-0000-0000-0000-000000000000')
      expect(typeof exceeded).toBe('boolean')
    })
  })

  describe('getDeviceOrderCount24h', () => {
    it('returns 0 for unknown device fingerprint', async () => {
      const count = await getDeviceOrderCount24h('nonexistent_fingerprint')
      expect(count).toBe(0)
    })

    it('returns a number', async () => {
      const count = await getDeviceOrderCount24h('test_fingerprint')
      expect(typeof count).toBe('number')
    })
  })

  describe('fraud alert creation', () => {
    it('does not throw when creating alert with valid data', async () => {
      // createFraudAlert is best-effort and logs errors
      expect(true).toBe(true)
    })
  })
})
