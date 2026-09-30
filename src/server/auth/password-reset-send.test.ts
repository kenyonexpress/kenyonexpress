import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sendEmail = vi.hoisted(() => vi.fn())
const generateLink = vi.hoisted(() => vi.fn())
const createAdminClient = vi.hoisted(() => vi.fn(() => ({ auth: { admin: { generateLink } } })))
const siteUrl = vi.hoisted(() => vi.fn(() => 'https://kenyonexpress.co.il'))
const logWarn = vi.hoisted(() => vi.fn())

vi.mock('@/lib/email/resend', () => ({ sendEmail }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient }))
vi.mock('@/lib/site-url', () => ({ siteUrl }))
vi.mock('@/lib/observability/log', () => ({
  log: { warn: (...a: unknown[]) => logWarn(...a), error: vi.fn(), info: vi.fn() },
}))

import { trySendBrandedPasswordReset } from './password-reset-send'

describe('trySendBrandedPasswordReset', () => {
  beforeEach(() => {
    sendEmail.mockReset()
    generateLink.mockReset()
    createAdminClient.mockClear()
    logWarn.mockReset()
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
    // biome-ignore lint/performance/noDelete: the tested condition is absence
    delete process.env.RESEND_API_KEY
    await expect(trySendBrandedPasswordReset('a@b.co')).resolves.toBe(false)
    expect(createAdminClient).not.toHaveBeenCalled()
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('asks GoTrue for a RECOVERY link, not a magic link', async () => {
    await trySendBrandedPasswordReset('a@b.co')
    expect(generateLink).toHaveBeenCalledWith({ type: 'recovery', email: 'a@b.co' })
  })

  it('mails a token_hash link to OUR callback with the recovery type and the reset form as next', async () => {
    await expect(trySendBrandedPasswordReset('a@b.co')).resolves.toBe(true)
    const input = sendEmail.mock.calls[0]?.[0] as {
      html: string
      text: string
      to: string
      subject: string
    }
    expect(input.to).toBe('a@b.co')
    expect(input.subject).toContain('איפוס סיסמה')
    expect(input.text).toContain(
      'https://kenyonexpress.co.il/auth/callback?token_hash=pkce_abc123&type=recovery&next=%2Freset-password',
    )
    expect(input.html).not.toContain('/auth/v1/verify')
  })

  it('falls back quietly for an unknown address, so the reply cannot reveal registration', async () => {
    generateLink.mockResolvedValue({
      data: { properties: null },
      error: { status: 404, message: 'User not found' },
    })
    await expect(trySendBrandedPasswordReset('new@b.co')).resolves.toBe(false)
    expect(sendEmail).not.toHaveBeenCalled()
    expect(logWarn).not.toHaveBeenCalled()
  })

  it('logs a non-routine GoTrue failure before falling back', async () => {
    generateLink.mockResolvedValue({
      data: { properties: null },
      error: { status: 500, message: 'service key rejected' },
    })
    await expect(trySendBrandedPasswordReset('a@b.co')).resolves.toBe(false)
    expect(logWarn).toHaveBeenCalledWith('auth.password_reset_generate_failed', {
      reason: 'service key rejected',
    })
  })

  it('falls back when Resend refuses, so the reset still goes out somehow', async () => {
    sendEmail.mockResolvedValue({ ok: false, reason: 'http_500' })
    await expect(trySendBrandedPasswordReset('a@b.co')).resolves.toBe(false)
    expect(logWarn).toHaveBeenCalledWith('auth.password_reset_send_failed', { reason: 'http_500' })
  })

  it('falls back rather than throwing when the admin client cannot be built', async () => {
    createAdminClient.mockImplementationOnce(() => {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY missing')
    })
    await expect(trySendBrandedPasswordReset('a@b.co')).resolves.toBe(false)
  })
})
