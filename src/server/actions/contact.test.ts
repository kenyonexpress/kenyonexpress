import { beforeEach, describe, expect, it, vi } from 'vitest'

const sendEmail = vi.hoisted(() => vi.fn())
const checkRateLimit = vi.hoisted(() => vi.fn())
const getClientIp = vi.hoisted(() => vi.fn())

vi.mock('@/lib/email/resend', () => ({ sendEmail }))
vi.mock('@/lib/utils/rate-limit', () => ({ checkRateLimit, getClientIp }))

import { submitContactForm } from './contact'

function form(fields: Record<string, string>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.set(key, value)
  return data
}

describe('submitContactForm', () => {
  beforeEach(() => {
    sendEmail.mockReset()
    checkRateLimit.mockReset()
    getClientIp.mockReset()
    getClientIp.mockResolvedValue('1.2.3.4')
    checkRateLimit.mockResolvedValue(true)
    sendEmail.mockResolvedValue({ ok: true, id: 'msg_1' })
  })

  it('rejects a short message', async () => {
    const result = await submitContactForm(
      { ok: false },
      form({ name: 'דני', email: 'a@b.co', message: 'קצר' }),
    )
    expect(result.ok).toBe(false)
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('swallows honeypot submissions without mailing', async () => {
    const result = await submitContactForm(
      { ok: false },
      form({
        name: 'דני כהן',
        email: 'dani@example.com',
        message: 'שלום, יש לי שאלה על הזמנה',
        company: 'Acme Spam',
      }),
    )
    expect(result.ok).toBe(true)
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('mails the inbox with reply-to set to the customer', async () => {
    const result = await submitContactForm(
      { ok: false },
      form({
        name: 'דני כהן',
        email: 'dani@example.com',
        message: 'שלום, יש לי שאלה על הזמנה של קופון',
      }),
    )
    expect(result.ok).toBe(true)
    expect(sendEmail).toHaveBeenCalledOnce()
    expect(sendEmail.mock.calls[0]?.[0]).toMatchObject({
      replyTo: 'dani@example.com',
      to: 'info@kenyonexpress.co.il',
    })
  })

  it('rate-limits repeat senders', async () => {
    checkRateLimit.mockResolvedValue(false)
    const result = await submitContactForm(
      { ok: false },
      form({
        name: 'דני כהן',
        email: 'dani@example.com',
        message: 'שלום, יש לי שאלה על הזמנה של קופון',
      }),
    )
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/ניסיונות/)
    expect(sendEmail).not.toHaveBeenCalled()
  })
})
