import { describe, expect, it, vi } from 'vitest'
import {
  countConsecutiveFailures,
  getAuthStats,
  getRecentAuthAttempts,
  recordAuthAttempt,
  shouldFallbackToEmail,
} from './auth-fallback'

// Mock Supabase admin client with proper query chaining
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => {
    // Create a recursive chainable mock
    const createMockQuery = (): any => {
      const mockQuery: any = {
        gte: vi.fn(() => mockQuery),
        order: vi.fn(() => mockQuery),
        eq: vi.fn((key: string, _value: any) => {
          // If it's the last eq in the chain, return a promise
          // Otherwise return the chainable object
          if (key === 'attempt_type' || key === 'user_id' || key === 'email' || key === 'phone') {
            return Promise.resolve({ data: [] })
          }
          return mockQuery
        }),
      }
      return mockQuery
    }

    return {
      from: vi.fn(() => ({
        insert: vi.fn().mockResolvedValue({ error: null }),
        select: vi.fn(() => createMockQuery()),
      })),
    }
  }),
}))

vi.mock('@/lib/observability/log', () => ({
  log: {
    error: vi.fn(),
    info: vi.fn(),
  },
}))

describe('auth-fallback', () => {
  describe('recordAuthAttempt', () => {
    it('records a successful attempt', async () => {
      await expect(
        recordAuthAttempt({
          userId: 'user-123',
          email: 'test@example.com',
          attemptType: 'passkey',
          success: true,
        }),
      ).resolves.toBeUndefined()
    })

    it('records a failed attempt', async () => {
      await expect(
        recordAuthAttempt({
          email: 'test@example.com',
          attemptType: 'whatsapp_otp',
          success: false,
          ipAddress: '127.0.0.1',
        }),
      ).resolves.toBeUndefined()
    })

    it('handles optional fields', async () => {
      await expect(
        recordAuthAttempt({
          attemptType: 'email_otp',
          success: false,
        }),
      ).resolves.toBeUndefined()
    })
  })

  describe('getRecentAuthAttempts', () => {
    it('returns empty array when no attempts', async () => {
      const attempts = await getRecentAuthAttempts({
        userId: 'user-123',
      })
      expect(Array.isArray(attempts)).toBe(true)
    })

    it('filters by user ID', async () => {
      const attempts = await getRecentAuthAttempts({
        userId: 'user-123',
        windowMinutes: 60,
      })
      expect(Array.isArray(attempts)).toBe(true)
    })

    it('filters by email', async () => {
      const attempts = await getRecentAuthAttempts({
        email: 'test@example.com',
      })
      expect(Array.isArray(attempts)).toBe(true)
    })

    it.skip('filters by attempt type', async () => {
      const attempts = await getRecentAuthAttempts({
        userId: 'user-123',
        attemptType: 'passkey',
      })
      expect(Array.isArray(attempts)).toBe(true)
    })
  })

  describe('countConsecutiveFailures', () => {
    it('returns 0 when no failures', async () => {
      const count = await countConsecutiveFailures({
        userId: 'user-123',
      })
      expect(count).toBe(0)
    })
  })

  describe('shouldFallbackToEmail', () => {
    it.skip('returns false when below threshold', async () => {
      const should = await shouldFallbackToEmail({
        userId: 'user-123',
        threshold: 3,
      })
      expect(should).toBe(false)
    })

    it.skip('uses default threshold of 3', async () => {
      const should = await shouldFallbackToEmail({
        email: 'test@example.com',
      })
      expect(typeof should).toBe('boolean')
    })
  })

  describe('getAuthStats', () => {
    it('returns stats structure', async () => {
      const stats = await getAuthStats({
        userId: 'user-123',
      })

      expect(stats).toHaveProperty('total')
      expect(stats).toHaveProperty('successful')
      expect(stats).toHaveProperty('failed')
      expect(stats).toHaveProperty('byType')
      expect(stats.byType).toHaveProperty('passkey')
      expect(stats.byType).toHaveProperty('whatsapp_otp')
      expect(stats.byType).toHaveProperty('email_otp')
      expect(stats.byType).toHaveProperty('password')
    })

    it('calculates stats correctly for empty data', async () => {
      const stats = await getAuthStats({
        userId: 'user-123',
      })

      expect(stats.total).toBe(0)
      expect(stats.successful).toBe(0)
      expect(stats.failed).toBe(0)
      expect(stats.byType.passkey.total).toBe(0)
    })
  })
})
