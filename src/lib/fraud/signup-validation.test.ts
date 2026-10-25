import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock dependencies
vi.mock('@/lib/observability/log', () => ({
  log: {
    error: vi.fn(),
    warn: vi.fn(),
  },
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    auth: {
      admin: {
        listUsers: () => Promise.resolve({ data: { users: [] }, error: null }),
      },
    },
    from: (_table: string) => ({
      select: () => ({
        eq: () => ({
          gte: () => Promise.resolve({ data: [], error: null }),
        }),
      }),
      insert: () => Promise.resolve({ error: null }),
    }),
  }),
}))

// Import after mocks
const { isDisposableEmail, isDuplicateEmail, isIpAccountCreationAbuse, logIpSignup } = await import(
  './signup-validation'
)

describe('signup-validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('isDisposableEmail', () => {
    it('detects disposable email domains', () => {
      expect(isDisposableEmail('test@mailinator.com')).toBe(true)
      expect(isDisposableEmail('user@tempmail.com')).toBe(true)
      expect(isDisposableEmail('spam@guerrillamail.com')).toBe(true)
      expect(isDisposableEmail('fake@10minutemail.com')).toBe(true)
    })

    it('allows legitimate email domains', () => {
      expect(isDisposableEmail('user@gmail.com')).toBe(false)
      expect(isDisposableEmail('admin@company.co.il')).toBe(false)
      expect(isDisposableEmail('info@example.org')).toBe(false)
    })

    it('is case-insensitive', () => {
      expect(isDisposableEmail('TEST@MAILINATOR.COM')).toBe(true)
      expect(isDisposableEmail('User@TempMail.com')).toBe(true)
    })

    it('handles invalid email formats gracefully', () => {
      expect(isDisposableEmail('notanemail')).toBe(false)
      expect(isDisposableEmail('@nodomain.com')).toBe(false)
      expect(isDisposableEmail('')).toBe(false)
    })
  })

  describe('isDuplicateEmail', () => {
    it('returns false for non-existent email', async () => {
      const isDupe = await isDuplicateEmail('new@example.com')
      expect(isDupe).toBe(false)
    })

    it('returns boolean', async () => {
      const isDupe = await isDuplicateEmail('test@example.com')
      expect(typeof isDupe).toBe('boolean')
    })
  })

  describe('isIpAccountCreationAbuse', () => {
    it('returns false when IP has not created accounts', async () => {
      const isAbuse = await isIpAccountCreationAbuse('192.168.1.1')
      expect(isAbuse).toBe(false)
    })

    it('returns boolean', async () => {
      const isAbuse = await isIpAccountCreationAbuse('192.168.1.1')
      expect(typeof isAbuse).toBe('boolean')
    })
  })

  describe('logIpSignup', () => {
    it('does not throw when logging signup', async () => {
      await expect(
        logIpSignup('192.168.1.1', 'user-id', 'test@example.com', false, null),
      ).resolves.toBeUndefined()
    })
  })
})
