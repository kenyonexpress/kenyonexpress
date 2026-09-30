import { beforeEach, describe, expect, it, vi } from 'vitest'

const sendText = vi.hoisted(() => vi.fn())
const sendTemplate = vi.hoisted(() => vi.fn())
const sendMail = vi.hoisted(() => vi.fn())
const logWarn = vi.hoisted(() => vi.fn())

vi.mock('@/server/whatsapp/twilio', () => ({
  sendWhatsAppMessage: (...a: unknown[]) => sendText(...a),
  sendWhatsAppTemplate: (...a: unknown[]) => sendTemplate(...a),
}))
vi.mock('@/lib/email/resend', () => ({ sendEmail: (...a: unknown[]) => sendMail(...a) }))
vi.mock('@/lib/observability/log', () => ({
  log: { warn: (...a: unknown[]) => logWarn(...a), error: vi.fn(), info: vi.fn() },
}))

import { forwardInboundToOwner, ownerForwardNumber, ticketRef } from './forward-to-owner'

const INPUT = {
  phone: '972501234567',
  ticketId: 'a1b2c3d4-0000-4000-8000-000000000000',
  body: 'ההזמנה שלי לא הגיעה\nמה קורה?',
  intent: 'message',
}

beforeEach(() => {
  sendText.mockReset().mockResolvedValue({ ok: true, sid: 'SM1' })
  sendTemplate.mockReset().mockResolvedValue({ ok: true, sid: 'MM1' })
  sendMail.mockReset().mockResolvedValue({ ok: true, id: 'em1' })
  logWarn.mockReset()
})

describe('ownerForwardNumber', () => {
  it('defaults to the published store WhatsApp, which is the owner phone on the floating button', () => {
    expect(ownerForwardNumber({})).toBe('972524635550')
  })

  it('is overridden by SUPPORT_FORWARD_WHATSAPP_TO in any Israeli form, and ignores garbage', () => {
    expect(ownerForwardNumber({ SUPPORT_FORWARD_WHATSAPP_TO: '050-999-8877' })).toBe('972509998877')
    expect(ownerForwardNumber({ SUPPORT_FORWARD_WHATSAPP_TO: '+972509998877' })).toBe(
      '972509998877',
    )
    expect(ownerForwardNumber({ SUPPORT_FORWARD_WHATSAPP_TO: 'nope' })).toBe('972524635550')
  })

  it('the ticket ref is the eight-character prefix the customer was told', () => {
    expect(ticketRef(INPUT.ticketId)).toBe('A1B2C3D4')
  })
})

describe('forwardInboundToOwner', () => {
  it('without an approved template sends free text to the owner and an email to the store inbox', async () => {
    const outcome = await forwardInboundToOwner(INPUT, { CONTACT_TO: 'ofir@example.com' })

    expect(outcome).toEqual({ whatsapp: 'sent', email: 'sent' })
    expect(sendTemplate).not.toHaveBeenCalled()
    const [to, text] = sendText.mock.calls[0] as [string, string]
    expect(to).toBe('972524635550')
    expect(text).toContain('050-123-4567')
    expect(text).toContain('A1B2C3D4')
    expect(text).toContain('ההזמנה שלי לא הגיעה מה קורה?')
    expect(text).toContain('/admin/support')

    const mail = sendMail.mock.calls[0]?.[0] as {
      to: string
      subject: string
      text: string
      html: string
    }
    expect(mail.to).toBe('ofir@example.com')
    expect(mail.subject).toContain('A1B2C3D4')
    expect(mail.subject).toContain('050-123-4567')
    expect(mail.text).toContain(INPUT.body)
    expect(mail.html).toContain(`/admin/support/${INPUT.ticketId}`)
  })

  it('with the support_inbound SID approved sends the template, not free text', async () => {
    const outcome = await forwardInboundToOwner(INPUT, {
      TWILIO_CONTENT_SID_SUPPORT_INBOUND: 'HXsupport',
      SUPPORT_FORWARD_WHATSAPP_TO: '0509998877',
    })

    expect(outcome.whatsapp).toBe('sent')
    expect(sendText).not.toHaveBeenCalled()
    expect(sendTemplate).toHaveBeenCalledWith('972509998877', 'HXsupport', {
      '1': '972501234567',
      '2': 'A1B2C3D4',
      '3': 'ההזמנה שלי לא הגיעה מה קורה?',
    })
  })

  it('labels a refund request as one, in the WhatsApp text and the mail subject', async () => {
    await forwardInboundToOwner({ ...INPUT, intent: 'refund_request' }, {})
    expect((sendText.mock.calls[0] as [string, string])[1]).toMatch(/^בקשת זיכוי/)
    expect((sendMail.mock.calls[0]?.[0] as { subject: string }).subject).toContain('בקשת זיכוי')
  })

  it('escapes the customer text in the HTML mail', async () => {
    await forwardInboundToOwner({ ...INPUT, body: '<script>alert(1)</script>' }, {})
    const mail = sendMail.mock.calls[0]?.[0] as { html: string }
    expect(mail.html).not.toContain('<script>')
    expect(mail.html).toContain('&lt;script&gt;')
  })

  it('SUPPORT_FORWARD_WHATSAPP_TO=off silences the WhatsApp leg and keeps the mail', async () => {
    const outcome = await forwardInboundToOwner(INPUT, { SUPPORT_FORWARD_WHATSAPP_TO: 'off' })
    expect(outcome).toEqual({ whatsapp: 'skipped', email: 'sent' })
    expect(sendText).not.toHaveBeenCalled()
  })

  it('never forwards the customer message back to the customer', async () => {
    const outcome = await forwardInboundToOwner(INPUT, {
      SUPPORT_FORWARD_WHATSAPP_TO: '0501234567',
    })
    expect(outcome.whatsapp).toBe('skipped')
    expect(sendText).not.toHaveBeenCalled()
  })

  it('a refused send and a missing credential are reported, logged once, and never thrown', async () => {
    sendText.mockResolvedValue({ ok: false, reason: 'http_400' })
    sendMail.mockResolvedValue({ ok: false, skipped: true, reason: 'no_api_key' })
    expect(await forwardInboundToOwner(INPUT, {})).toEqual({ whatsapp: 'failed', email: 'skipped' })
    expect(logWarn).toHaveBeenCalledWith(
      'whatsapp.forward_to_owner_failed',
      expect.objectContaining({ reason: 'http_400' }),
    )

    sendText.mockRejectedValue(new Error('ECONNRESET'))
    sendMail.mockRejectedValue(new Error('down'))
    expect(await forwardInboundToOwner(INPUT, {})).toEqual({ whatsapp: 'failed', email: 'failed' })
  })
})
