import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  type TwilioWhatsAppEnv,
  loadTwilioEnv,
  sendWhatsAppMessage,
  twilioSignatureValid,
} from './twilio'

/**
 * The transport and the signature check. The signature test computes its
 * expectation with an independent inline HMAC rather than calling the code
 * under test, so an algorithm bug cannot verify itself.
 */

const ENV: TwilioWhatsAppEnv = {
  accountSid: 'ACtest',
  authToken: 'token-secret',
  fromNumber: '+14155238886',
}

function sign(authToken: string, url: string, params: Record<string, string>): string {
  const data =
    url +
    Object.keys(params)
      .sort()
      .map((k) => k + params[k])
      .join('')
  return createHmac('sha1', authToken).update(Buffer.from(data, 'utf-8')).digest('base64')
}

const URL_UNDER_TEST = 'https://example.test/api/webhooks/whatsapp'
const PARAMS = {
  MessageSid: 'SM123',
  From: 'whatsapp:+972501234567',
  Body: 'שלום',
}

describe('twilioSignatureValid', () => {
  it('accepts Twilio’s own scheme: URL plus sorted name+value pairs', () => {
    const header = sign(ENV.authToken, URL_UNDER_TEST, PARAMS)
    expect(twilioSignatureValid(ENV.authToken, header, URL_UNDER_TEST, PARAMS)).toBe(true)
  })

  it('rejects a missing header', () => {
    expect(twilioSignatureValid(ENV.authToken, null, URL_UNDER_TEST, PARAMS)).toBe(false)
  })

  it('rejects a signature made with another token', () => {
    const header = sign('wrong-token', URL_UNDER_TEST, PARAMS)
    expect(twilioSignatureValid(ENV.authToken, header, URL_UNDER_TEST, PARAMS)).toBe(false)
  })

  it('rejects when any param was tampered with after signing', () => {
    const header = sign(ENV.authToken, URL_UNDER_TEST, PARAMS)
    const tampered = { ...PARAMS, Body: 'הסר' }
    expect(twilioSignatureValid(ENV.authToken, header, URL_UNDER_TEST, tampered)).toBe(false)
  })

  it('rejects when the URL differs from the one signed', () => {
    const header = sign(ENV.authToken, URL_UNDER_TEST, PARAMS)
    expect(
      twilioSignatureValid(
        ENV.authToken,
        header,
        'https://other.test/api/webhooks/whatsapp',
        PARAMS,
      ),
    ).toBe(false)
  })

  it('rejects garbage that does not decode to a 20-byte digest', () => {
    expect(twilioSignatureValid(ENV.authToken, 'notbase64!!', URL_UNDER_TEST, PARAMS)).toBe(false)
  })
})

describe('loadTwilioEnv', () => {
  const env = (vars: Record<string, string>) => vars as unknown as NodeJS.ProcessEnv

  it('is all three vars or nothing', () => {
    expect(loadTwilioEnv(env({}))).toBeNull()
    expect(loadTwilioEnv(env({ TWILIO_ACCOUNT_SID: 'AC', TWILIO_AUTH_TOKEN: 't' }))).toBeNull()
    expect(
      loadTwilioEnv(
        env({ TWILIO_ACCOUNT_SID: 'AC', TWILIO_AUTH_TOKEN: 't', TWILIO_WHATSAPP_FROM: '+1' }),
      ),
    ).toEqual({ accountSid: 'AC', authToken: 't', fromNumber: '+1' })
  })
})

describe('sendWhatsAppMessage', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reports skipped, and calls nothing, when Twilio is not configured', async () => {
    const result = await sendWhatsAppMessage('972501234567', 'שלום', null)
    expect(result).toEqual({ ok: false, skipped: true, reason: 'not_configured' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('posts the whatsapp:-prefixed pair and returns the sid', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ sid: 'SM999' }), { status: 201 }))

    const result = await sendWhatsAppMessage('972501234567', 'שלום', ENV)

    expect(result).toEqual({ ok: true, sid: 'SM999' })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.twilio.com/2010-04-01/Accounts/ACtest/Messages.json')
    const form = new URLSearchParams(String(init.body))
    expect(form.get('From')).toBe('whatsapp:+14155238886')
    expect(form.get('To')).toBe('whatsapp:+972501234567')
    expect(form.get('Body')).toBe('שלום')
    expect((init.headers as Record<string, string>).authorization).toMatch(/^Basic /)
  })

  it('surfaces a refusal as ok:false with the status, and never throws', async () => {
    fetchMock.mockResolvedValue(new Response('nope', { status: 401 }))
    expect(await sendWhatsAppMessage('972501234567', 'שלום', ENV)).toEqual({
      ok: false,
      reason: 'http_401',
    })
  })

  it('turns a network error into ok:false rather than throwing', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNRESET'))
    expect(await sendWhatsAppMessage('972501234567', 'שלום', ENV)).toEqual({
      ok: false,
      reason: 'ECONNRESET',
    })
  })
})
