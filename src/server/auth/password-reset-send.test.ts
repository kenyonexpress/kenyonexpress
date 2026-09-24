import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sendEmail = vi.hoisted(() => vi.fn())
const generateLink = vi.hoisted(() => vi.fn())
const createAdminClient = vi.hoisted(() => vi.fn(() => ({ auth: { admin: { generateLink } } })))
const siteUrl = vi.hoisted(() => vi.fn(() => 'https://kenyonexpress.co.il'))

vi.mock('@/lib/email/resend', () => ({ sendEmail }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient }))
vi.mock('@/lib/site-url', () => ({ siteUrl }))

import { trySendBrandedPasswordReset } from './password-reset-send'

describe('trySendBrandedPasswordReset', () => {
  beforeEach(() => {
    sendEmail.mockReset()
    generateLink.mockReset()
    createAdminClient.mockClear()
    process.env.RESEND_API_KEY = 're_test'
    sendEmail.mockResolvedValue({ ok: true, id: 'msg_1' })
    generateLink.mockResolvedValue({
      data: { properties: { hashed_token: 'pkce_abc123' } },
      error: null,
    })
  })

  afterEach(() => {
    // biome-ignore lint/performance/noDelete: env cleanup between tests
    delete process.env.RESEND_API_KEY
  })

  it('declines immediately without a Resend key, touching nothing', async () => {
    // Q09: Resend only if RESEND_API_KEY exists. Without it the caller falls
    // back to Supabase's own mail, so nothing here may run.
    // biome-ignore lint/performance/noDelete: the tested condition is absence
    delete process.env.RESEND_API_KEY
    await expect(trySendBrandedPasswordReset('a@b.co')).resolves.toBe(false)
    expect(createAdminClient).not.toHaveBeenCalled()
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('asks GoTrue for a recovery token and mails OUR callback with type=recovery', async () => {
    await expect(trySendBrandedPasswordReset('a@b.co')).resolves.toBe(true)
    expect(generateLink).toHaveBeenCalledWith({ type: 'recovery', email: 'a@b.co' })
    const input = sendEmail.mock.calls[0]?.[0] as {
      html: string
      text: string
      to: string
      subject: string
      tag?: string
    }
    expect(input.to).toBe('a@b.co')
    expect(input.subject).toContain('איפוס סיסמה')
    expect(input.text).toContain(
      'https://kenyonexpress.co.il/auth/callback?token_hash=pkce_abc123&type=recovery&next=%2Freset-password',
    )
    expect(input.html).not.toContain('/auth/v1/verify')
    expect(input.tag).toBe('password_reset')
  })

  it('falls back for an unknown address without revealing it', async () => {
    generateLink.mockResolvedValue({
      data: { properties: null },
      error: { status: 404, message: 'User not found' },
    })
    await expect(trySendBrandedPasswordReset('new@b.co')).resolves.toBe(false)
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('falls back when Resend refuses, so the reset still goes out somehow', async () => {
    sendEmail.mockResolvedValue({ ok: false, reason: 'http_500' })
    await expect(trySendBrandedPasswordReset('a@b.co')).resolves.toBe(false)
  })

  it('falls back rather than throwing when the admin client cannot be built', async () => {
    createAdminClient.mockImplementationOnce(() => {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY missing')
    })
    await expect(trySendBrandedPasswordReset('a@b.co')).resolves.toBe(false)
  })
})
