import * as resend from '@/lib/growth/resend'
import * as supabaseAdmin from '@/lib/supabase/admin'
import * as supabaseServer from '@/lib/supabase/server'
import * as rateLimit from '@/lib/utils/rate-limit'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  type NewsletterState,
  confirmNewsletter,
  subscribeToNewsletter,
  unsubscribeByToken,
} from './newsletter'

vi.mock('@/lib/supabase/admin')
vi.mock('@/lib/supabase/server')
vi.mock('@/lib/utils/rate-limit')
vi.mock('@/lib/growth/resend')
vi.mock('@/lib/observability/action-context', () => ({
  withActionContext: (_label: string, fn: () => Promise<any>) => fn(),
}))
vi.mock('next/headers', () => ({
  headers: vi.fn(() => Promise.resolve({ get: vi.fn(() => null) })),
}))

describe('Newsletter Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('subscribeToNewsletter', () => {
    it('validates email format', async () => {
      vi.mocked(rateLimit.getClientIp).mockResolvedValue('127.0.0.1')

      const formData = new FormData()
      formData.set('email', 'invalid-email')

      const result = await subscribeToNewsletter({} as NewsletterState, formData)

      expect(result.ok).toBe(false)
      expect(result.error).toBe('כתובת מייל לא תקינה')
    })

    it('validates email max length', async () => {
      vi.mocked(rateLimit.getClientIp).mockResolvedValue('127.0.0.1')

      const longEmail = `${'a'.repeat(260)}@example.com`
      const formData = new FormData()
      formData.set('email', longEmail)

      const result = await subscribeToNewsletter({} as NewsletterState, formData)

      expect(result.ok).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('checks rate limit', async () => {
      vi.mocked(rateLimit.getClientIp).mockResolvedValue('127.0.0.1')
      vi.mocked(rateLimit.checkRateLimit).mockResolvedValue(false)

      const formData = new FormData()
      formData.set('email', 'test@example.com')

      const result = await subscribeToNewsletter({} as NewsletterState, formData)

      expect(result.ok).toBe(false)
      expect(result.error).toBe('יותר מדי ניסיונות. נסו שוב מאוחר יותר.')
    })

    it('returns same answer for suppressed emails', async () => {
      const mockAdminClient = {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { email: 'test@example.com' } }),
        })),
      }

      vi.mocked(supabaseAdmin.createAdminClient).mockReturnValue(mockAdminClient as any)
      vi.mocked(rateLimit.getClientIp).mockResolvedValue('127.0.0.1')
      vi.mocked(rateLimit.checkRateLimit).mockResolvedValue(true)

      const formData = new FormData()
      formData.set('email', 'test@example.com')

      const result = await subscribeToNewsletter({} as NewsletterState, formData)

      expect(result.ok).toBe(true)
      expect(result.message).toContain('אם הכתובת תקינה')
    })

    it('returns same answer for already subscribed emails', async () => {
      const mockAdminClient = {
        from: vi.fn((table) => {
          if (table === 'email_suppressions') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: null }),
            }
          }
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null }),
            upsert: vi.fn().mockResolvedValue({ error: null }),
          }
        }),
      }

      vi.mocked(supabaseAdmin.createAdminClient).mockReturnValue(mockAdminClient as any)
      vi.mocked(supabaseServer.createClient).mockResolvedValue({
        auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
      } as any)
      vi.mocked(rateLimit.getClientIp).mockResolvedValue('127.0.0.1')
      vi.mocked(rateLimit.checkRateLimit).mockResolvedValue(true)
      vi.mocked(resend.sendEmail).mockResolvedValue({ ok: true, id: '1' } as any)
      vi.mocked(resend.syncAudienceContact).mockResolvedValue({} as any)

      const formData = new FormData()
      formData.set('email', 'test@example.com')

      const result = await subscribeToNewsletter({} as NewsletterState, formData)

      expect(result.ok).toBe(true)
      expect(result.message).toContain('אם הכתובת תקינה')
    })

    it('returns error message when email is not provided', async () => {
      vi.mocked(rateLimit.getClientIp).mockResolvedValue('127.0.0.1')

      const formData = new FormData()
      const result = await subscribeToNewsletter({} as NewsletterState, formData)

      expect(result.ok).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('trims and lowercases email', async () => {
      const mockAdminClient = {
        from: vi.fn((table) => {
          if (table === 'email_suppressions') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: null }),
            }
          }
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null }),
            upsert: vi.fn().mockResolvedValue({ error: null }),
          }
        }),
      }

      vi.mocked(supabaseAdmin.createAdminClient).mockReturnValue(mockAdminClient as any)
      vi.mocked(supabaseServer.createClient).mockResolvedValue({
        auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
      } as any)
      vi.mocked(rateLimit.getClientIp).mockResolvedValue('127.0.0.1')
      vi.mocked(rateLimit.checkRateLimit).mockResolvedValue(true)
      vi.mocked(resend.sendEmail).mockResolvedValue({ ok: true, id: '1' } as any)
      vi.mocked(resend.syncAudienceContact).mockResolvedValue({} as any)

      const formData = new FormData()
      formData.set('email', '  TEST@EXAMPLE.COM  ')

      await subscribeToNewsletter({} as NewsletterState, formData)

      expect(vi.mocked(resend.sendEmail)).toHaveBeenCalled()
    })
  })

  describe('confirmNewsletter', () => {
    it('returns error when token is empty', async () => {
      const result = await confirmNewsletter('')

      expect(result.ok).toBe(false)
      expect(result.error).toBe('קישור לא תקין')
    })

    it('returns error when token is invalid', async () => {
      const mockAdminClient = {
        from: vi.fn(() => ({
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        })),
      }

      vi.mocked(supabaseAdmin.createAdminClient).mockReturnValue(mockAdminClient as any)

      const result = await confirmNewsletter('invalid-token')

      expect(result.ok).toBe(false)
      expect(result.error).toBe('הקישור אינו תקף או שכבר נעשה בו שימוש')
    })

    it('confirms newsletter subscription', async () => {
      const mockAdminClient = {
        from: vi.fn((table) => {
          if (table === 'newsletter_subscribers') {
            return {
              update: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              select: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: { email: 'test@example.com' },
                error: null,
              }),
            }
          }
          return {
            delete: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null }),
          }
        }),
      }

      vi.mocked(supabaseAdmin.createAdminClient).mockReturnValue(mockAdminClient as any)
      vi.mocked(resend.syncAudienceContact).mockResolvedValue({} as any)

      const result = await confirmNewsletter('valid-token')

      expect(result.ok).toBe(true)
      expect(result.message).toContain('ההרשמה אושרה')
    })
  })

  describe('unsubscribeByToken', () => {
    it('returns error when unsubscribe fails', async () => {
      const mockAdminClient = {
        rpc: vi.fn().mockResolvedValue({ error: new Error('RPC error') }),
      }

      vi.mocked(supabaseAdmin.createAdminClient).mockReturnValue(mockAdminClient as any)

      const result = await unsubscribeByToken('token')

      expect(result.ok).toBe(false)
      expect(result.error).toBe('ההסרה נכשלה. נסו שוב.')
    })

    it('unsubscribes user by token', async () => {
      const mockAdminClient = {
        rpc: vi.fn().mockResolvedValue({ error: null }),
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { email: 'test@example.com' } }),
        })),
      }

      vi.mocked(supabaseAdmin.createAdminClient).mockReturnValue(mockAdminClient as any)
      vi.mocked(resend.syncAudienceContact).mockResolvedValue({} as any)

      const result = await unsubscribeByToken('token')

      expect(result.ok).toBe(true)
      expect(result.message).toContain('הוסרת')
    })

    it('syncs unsubscribe to Resend', async () => {
      const mockAdminClient = {
        rpc: vi.fn().mockResolvedValue({ error: null }),
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { email: 'test@example.com' } }),
        })),
      }

      vi.mocked(supabaseAdmin.createAdminClient).mockReturnValue(mockAdminClient as any)
      vi.mocked(resend.syncAudienceContact).mockResolvedValue({} as any)

      const result = await unsubscribeByToken('token', 'uninterested')

      expect(result.ok).toBe(true)
      expect(vi.mocked(resend.syncAudienceContact)).toHaveBeenCalledWith({
        email: 'test@example.com',
        subscribed: false,
      })
    })
  })
})
