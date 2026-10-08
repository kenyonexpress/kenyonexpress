import { beforeEach, describe, expect, it, vi } from 'vitest'

const sendEmail = vi.hoisted(() => vi.fn())
const checkRateLimit = vi.hoisted(() => vi.fn())
const getClientIp = vi.hoisted(() => vi.fn())

vi.mock('@/lib/email/resend', () => ({ sendEmail }))
vi.mock('@/lib/utils/rate-limit', () => ({ checkRateLimit, getClientIp }))

import { submitHelpRequest } from './help'

const FULL = '6f1e2d3c-4b5a-4c6d-8e9f-0a1b2c3d4e5f'

function form(fields: Record<string, string>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.set(key, value)
  return data
}

const VALID = {
  name: 'דני כהן',
  email: 'dani@example.com',
  topic: 'orders',
  message: 'שלום, יש לי שאלה על ההזמנה שביצעתי אתמול',
}

describe('submitHelpRequest', () => {
  beforeEach(() => {
    sendEmail.mockReset()
    checkRateLimit.mockReset()
    getClientIp.mockReset()
    getClientIp.mockResolvedValue('1.2.3.4')
    checkRateLimit.mockResolvedValue(true)
    sendEmail.mockResolvedValue({ ok: true, id: 'msg_1' })
    vi.unstubAllEnvs()
    vi.stubEnv('SUPPORT_TO', undefined)
    vi.stubEnv('CONTACT_TO', undefined)
  })

  it('rejects a short message and an unknown topic without mailing', async () => {
    expect((await submitHelpRequest({ ok: false }, form({ ...VALID, message: 'קצר' }))).ok).toBe(
      false,
    )
    expect((await submitHelpRequest({ ok: false }, form({ ...VALID, topic: 'billing' }))).ok).toBe(
      false,
    )
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('rejects an order reference that is not an id, so it is never mailed', async () => {
    const result = await submitHelpRequest(
      { ok: false },
      form({ ...VALID, orderRef: '<script>alert(1)</script>' }),
    )
    expect(result.ok).toBe(false)
    expect(result.error).toContain('מספר ההזמנה')
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('swallows honeypot submissions without mailing', async () => {
    const result = await submitHelpRequest({ ok: false }, form({ ...VALID, company: 'Acme Spam' }))
    expect(result.ok).toBe(true)
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('refuses past the rate limit', async () => {
    checkRateLimit.mockResolvedValue(false)
    const result = await submitHelpRequest({ ok: false }, form(VALID))
    expect(result.ok).toBe(false)
    expect(checkRateLimit).toHaveBeenCalledWith('help:1.2.3.4', 5, 3600)
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('mails SUPPORT_TO with the topic, the order and reply-to set to the customer', async () => {
    vi.stubEnv('SUPPORT_TO', 'ofir@example.com')
    vi.stubEnv('CONTACT_TO', 'info@example.com')
    const result = await submitHelpRequest({ ok: false }, form({ ...VALID, orderRef: FULL }))
    expect(result.ok).toBe(true)
    expect(sendEmail).toHaveBeenCalledOnce()
    const mail = sendEmail.mock.calls[0]?.[0]
    expect(mail).toMatchObject({ to: 'ofir@example.com', replyTo: 'dani@example.com' })
    expect(mail.subject).toContain('הזמנות ותשלום')
    expect(mail.subject).toContain('6F1E2D3C')
    expect(mail.html).toContain(FULL)
    expect(mail.text).toContain(`הזמנה: ${FULL}`)
    expect(mail.html).toContain('הזמנות ותשלום')
  })

  it('falls through to CONTACT_TO when SUPPORT_TO is unset, and omits the order line without one', async () => {
    vi.stubEnv('CONTACT_TO', 'info@example.com')
    const result = await submitHelpRequest({ ok: false }, form(VALID))
    expect(result.ok).toBe(true)
    const mail = sendEmail.mock.calls[0]?.[0]
    expect(mail.to).toBe('info@example.com')
    expect(mail.text).not.toContain('הזמנה:')
    expect(mail.html).not.toContain('<strong>הזמנה:</strong>')
  })

  it('escapes the customer text in the HTML body', async () => {
    const result = await submitHelpRequest(
      { ok: false },
      form({
        ...VALID,
        name: 'דני <b>כהן</b>',
        message: 'שלום <script>alert(1)</script> יש לי שאלה',
      }),
    )
    expect(result.ok).toBe(true)
    const mail = sendEmail.mock.calls[0]?.[0]
    expect(mail.html).not.toContain('<script>')
    expect(mail.html).toContain('&lt;script&gt;')
    expect(mail.html).toContain('&lt;b&gt;כהן&lt;/b&gt;')
  })

  it('reports a send failure, and treats a skipped send (no API key) as received', async () => {
    sendEmail.mockResolvedValue({ ok: false, reason: 'boom' })
    expect((await submitHelpRequest({ ok: false }, form(VALID))).ok).toBe(false)
    sendEmail.mockResolvedValue({ ok: false, skipped: true, reason: 'no_api_key' })
    expect((await submitHelpRequest({ ok: false }, form(VALID))).ok).toBe(true)
  })
})
