import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sendEmail = vi.hoisted(() => vi.fn())
const generateLink = vi.hoisted(() => vi.fn())
const createAdminClient = vi.hoisted(() => vi.fn(() => ({ auth: { admin: { generateLink } } })))
const siteUrl = vi.hoisted(() => vi.fn(() => 'https://kenyonexpress.co.il'))

vi.mock('@/lib/email/resend', () => ({ sendEmail }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient }))
vi.mock('@/lib/site-url', () => ({ siteUrl }))

import { trySendBrandedMagicLink } from './magic-link-send'

describe('trySendBrandedMagicLink', () => {
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
    // biome-ignore lint/performance/noDelete: the tested condition is absence
    delete process.env.RESEND_API_KEY
    await expect(trySendBrandedMagicLink('a@b.co')).resolves.toBe(false)
    expect(createAdminClient).not.toHaveBeenCalled()
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('mails a token_hash link to OUR callback, never the GoTrue action_link', async () => {
    // action_link completes in a URL fragment a server route cannot read;
    // the whole reason this module exists is to link the callback instead.
    await expect(trySendBrandedMagicLink('a@b.co')).resolves.toBe(true)
    const input = sendEmail.mock.calls[0]?.[0] as { html: string; text: string; to: string }
    expect(input.to).toBe('a@b.co')
    expect(input.text).toContain(
      'https://kenyonexpress.co.il/auth/callback?token_hash=pkce_abc123&type=magiclink',
    )
    expect(input.html).not.toContain('/auth/v1/verify')
  })

  it('falls back for an unknown address so signInWithOtp can create the account', async () => {
    generateLink.mockResolvedValue({
      data: { properties: null },
      error: { status: 404, message: 'User not found' },
    })
    await expect(trySendBrandedMagicLink('new@b.co')).resolves.toBe(false)
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('falls back when Resend refuses, so the login still goes out somehow', async () => {
    sendEmail.mockResolvedValue({ ok: false, reason: 'http_500' })
    await expect(trySendBrandedMagicLink('a@b.co')).resolves.toBe(false)
  })

  it('falls back rather than throwing when the admin client cannot be built', async () => {
    createAdminClient.mockImplementationOnce(() => {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY missing')
    })
    await expect(trySendBrandedMagicLink('a@b.co')).resolves.toBe(false)
  })
})
