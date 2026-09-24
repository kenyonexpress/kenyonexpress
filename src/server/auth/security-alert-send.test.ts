import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sendEmail = vi.hoisted(() => vi.fn())
const siteUrl = vi.hoisted(() => vi.fn(() => 'https://kenyonexpress.co.il'))

vi.mock('@/lib/email/resend', () => ({ sendEmail }))
vi.mock('@/lib/site-url', () => ({ siteUrl }))

import { trySendSecurityAlert } from './security-alert-send'

describe('trySendSecurityAlert', () => {
  beforeEach(() => {
    sendEmail.mockReset()
    process.env.RESEND_API_KEY = 're_test'
    sendEmail.mockResolvedValue({ ok: true, id: 'msg_1' })
  })

  afterEach(() => {
    // biome-ignore lint/performance/noDelete: env cleanup between tests
    delete process.env.RESEND_API_KEY
  })

  it('sends nothing without a Resend key (Q09: Resend only when the key exists)', async () => {
    // biome-ignore lint/performance/noDelete: the tested condition is absence
    delete process.env.RESEND_API_KEY
    await expect(
      trySendSecurityAlert({ email: 'a@b.co', event: 'password_changed', userId: 'u1' }),
    ).resolves.toBe(false)
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('sends nothing to an account with no address, without throwing', async () => {
    await expect(
      trySendSecurityAlert({ email: null, event: 'passkey_added', userId: 'u1' }),
    ).resolves.toBe(false)
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('mails the event, tagged, with an idempotency key on the user, event and minute', async () => {
    await expect(
      trySendSecurityAlert({ email: 'a@b.co', event: 'totp_enabled', userId: 'u1' }),
    ).resolves.toBe(true)
    const input = sendEmail.mock.calls[0]?.[0] as {
      to: string
      subject: string
      tag?: string
      idempotencyKey?: string
    }
    expect(input.to).toBe('a@b.co')
    expect(input.subject).toContain('אימות דו-שלבי')
    expect(input.tag).toBe('security_totp_enabled')
    expect(input.idempotencyKey).toMatch(
      /^security-alert:u1:totp_enabled:\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/,
    )
  })

  it('reports false and never throws when the provider refuses', async () => {
    sendEmail.mockResolvedValue({ ok: false, reason: 'http_500' })
    await expect(
      trySendSecurityAlert({ email: 'a@b.co', event: 'passkey_removed', userId: 'u1' }),
    ).resolves.toBe(false)
    sendEmail.mockRejectedValue(new Error('network'))
    await expect(
      trySendSecurityAlert({ email: 'a@b.co', event: 'passkey_removed', userId: 'u1' }),
    ).resolves.toBe(false)
  })
})
