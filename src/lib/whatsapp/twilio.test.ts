import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isWhatsappConfigured, sendWhatsappTemplate, toWhatsappAddress } from './twilio'

/**
 * The Twilio WhatsApp sender (marathon step 8). The contract under test is
 * the same one growth/resend.ts holds: inert without credentials, one REST
 * call with the exact shape the API wants, bounded error strings.
 */

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ sid: 'SM1' }), { status: 201 }))
  vi.stubEnv('TWILIO_ACCOUNT_SID', 'AC_test')
  vi.stubEnv('TWILIO_AUTH_TOKEN', 'tok_test')
  vi.stubEnv('TWILIO_WHATSAPP_FROM', 'whatsapp:+14155238886')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('configuration', () => {
  it('is inert when ANY of the three variables is missing', async () => {
    for (const missing of ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_WHATSAPP_FROM']) {
      vi.stubEnv(missing, '')
      expect(isWhatsappConfigured()).toBe(false)
      const result = await sendWhatsappTemplate({
        to: 'whatsapp:+972501234567',
        contentSid: 'HX1',
        variables: { '1': 'x' },
      })
      expect(result).toEqual({ ok: false, skipped: true })
      vi.stubEnv(missing, missing === 'TWILIO_WHATSAPP_FROM' ? 'whatsapp:+14155238886' : 'restore')
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('toWhatsappAddress', () => {
  it('normalises the forms the profiles table actually holds', () => {
    expect(toWhatsappAddress('0501234567')).toBe('whatsapp:+972501234567')
    expect(toWhatsappAddress('050-123-4567')).toBe('whatsapp:+972501234567')
    expect(toWhatsappAddress('+972501234567')).toBe('whatsapp:+972501234567')
    expect(toWhatsappAddress('972501234567')).toBe('whatsapp:+972501234567')
  })

  it('refuses to guess at anything else', () => {
    // A template pushed to a wrong number is worse than one not sent.
    expect(toWhatsappAddress(null)).toBeNull()
    expect(toWhatsappAddress('')).toBeNull()
    expect(toWhatsappAddress('03-1234567')).toBeNull() // landline
    expect(toWhatsappAddress('12345')).toBeNull()
    expect(toWhatsappAddress('+15551234567')).toBeNull() // not Israeli
  })
})

describe('sendWhatsappTemplate', () => {
  it('posts the form Twilio wants, under basic auth, to the account resource', async () => {
    const result = await sendWhatsappTemplate({
      to: 'whatsapp:+972501234567',
      contentSid: 'HX_issued',
      variables: { '1': 'ABCDE12345', '2': 'הקפה של יוסי' },
    })
    expect(result).toEqual({ ok: true, sid: 'SM1' })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.twilio.com/2010-04-01/Accounts/AC_test/Messages.json')
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Basic ${Buffer.from('AC_test:tok_test').toString('base64')}`,
    )
    const form = new URLSearchParams(init.body as string)
    expect(form.get('From')).toBe('whatsapp:+14155238886')
    expect(form.get('To')).toBe('whatsapp:+972501234567')
    expect(form.get('ContentSid')).toBe('HX_issued')
    expect(JSON.parse(form.get('ContentVariables') ?? '{}')).toEqual({
      '1': 'ABCDE12345',
      '2': 'הקפה של יוסי',
    })
  })

  it('reports a non-2xx with the status and a bounded detail', async () => {
    fetchMock.mockResolvedValue(new Response('e'.repeat(500), { status: 429 }))
    const result = await sendWhatsappTemplate({
      to: 'whatsapp:+972501234567',
      contentSid: 'HX1',
      variables: {},
    })
    expect(result.ok).toBe(false)
    if (!result.ok && 'error' in result) {
      expect(result.error).toMatch(/^twilio 429: /)
      expect(result.error.length).toBeLessThanOrEqual('twilio 429: '.length + 200)
    }
  })
})
