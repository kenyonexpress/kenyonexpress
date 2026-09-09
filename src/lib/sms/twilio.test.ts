import { afterEach, describe, expect, it, vi } from 'vitest'
import { isSmsConfigured, isSmsEnabled, sendSms, toSmsAddress } from './twilio'

/**
 * The client, against a mocked Twilio.
 *
 * TWO LOCKS, AND THE TEST FOR EACH IS THE POINT. `SMS_ENABLED` and
 * `TWILIO_SMS_FROM` are separate conditions because the credentials are shared
 * with WhatsApp: without the flag, the day somebody sets a `TWILIO_SMS_FROM`
 * for a test the whole notification queue would start sending SMS to real
 * customers from a sender nobody registered with the Israeli carriers -- and
 * carriers drop those silently, so nothing would report it.
 */

const ENV = {
  SMS_ENABLED: 'true',
  TWILIO_ACCOUNT_SID: 'AC123',
  TWILIO_AUTH_TOKEN: 'token',
  TWILIO_SMS_FROM: 'KenyonExp',
} as unknown as NodeJS.ProcessEnv

function twilioAccepting(body: Record<string, unknown> = { sid: 'SM1', num_segments: '2' }) {
  return vi.fn(async () => ({
    ok: true,
    status: 201,
    json: async () => body,
    text: async () => JSON.stringify(body),
  })) as unknown as typeof fetch
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the two locks', () => {
  it('sends nothing while SMS_ENABLED is not exactly "true"', async () => {
    const fetchMock = twilioAccepting()
    vi.stubGlobal('fetch', fetchMock)

    for (const value of [undefined, '', 'false', 'TRUE', '1', 'yes']) {
      const env = { ...ENV, SMS_ENABLED: value } as unknown as NodeJS.ProcessEnv
      const result = await sendSms({ to: '+972501234567', body: 'שלום', env })
      expect(result, String(value)).toMatchObject({ ok: false, skipped: true })
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends nothing without a registered sender, and says why', async () => {
    const fetchMock = twilioAccepting()
    vi.stubGlobal('fetch', fetchMock)

    const env = { ...ENV, TWILIO_SMS_FROM: undefined } as unknown as NodeJS.ProcessEnv
    const result = await sendSms({ to: '+972501234567', body: 'שלום', env })

    expect(result).toMatchObject({ ok: false, skipped: true })
    expect(result).toMatchObject({ reason: expect.stringContaining('registered Israeli sender') })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reports configured only when both locks are open', () => {
    expect(isSmsEnabled(ENV)).toBe(true)
    expect(isSmsConfigured(ENV)).toBe(true)
    expect(isSmsConfigured({ ...ENV, SMS_ENABLED: 'false' } as unknown as NodeJS.ProcessEnv)).toBe(
      false,
    )
    expect(
      isSmsConfigured({ ...ENV, TWILIO_SMS_FROM: undefined } as unknown as NodeJS.ProcessEnv),
    ).toBe(false)
  })

  it('uses TWILIO_SMS_FROM and never the WhatsApp sender', async () => {
    // Sharing one variable would mean configuring WhatsApp silently enabled SMS
    // from a number not approved to send it.
    const fetchMock = twilioAccepting()
    vi.stubGlobal('fetch', fetchMock)

    const env = {
      ...ENV,
      TWILIO_SMS_FROM: undefined,
      TWILIO_WHATSAPP_FROM: '+14155238886',
    } as unknown as NodeJS.ProcessEnv
    expect(await sendSms({ to: '+972501234567', body: 'שלום', env })).toMatchObject({
      skipped: true,
    })
  })
})

describe('the Israeli number', () => {
  it.each([
    ['0501234567', '+972501234567'],
    ['050-123-4567', '+972501234567'],
    ['+972501234567', '+972501234567'],
    ['972501234567', '+972501234567'],
    ['054 987 6543', '+972549876543'],
  ])('normalises %s', (input, expected) => {
    expect(toSmsAddress(input)).toBe(expected)
  })

  it('refuses an Israeli LANDLINE, which Twilio would bill and deliver nowhere', () => {
    // The refusal that saves real money. 03/04/08/09 and the 07x ranges are
    // accepted by Twilio's API and dropped by the carrier.
    for (const landline of ['031234567', '0412345678', '086543210', '097654321', '0731234567']) {
      expect(toSmsAddress(landline), landline).toBeNull()
    }
  })

  it('refuses anything it cannot be sure of, rather than guessing', () => {
    // A message pushed to a wrong number is worse than one not sent, and in SMS
    // it is also a message read by a stranger.
    for (const bad of ['', '   ', '05012345', '05012345678', '+14155238886', 'not a phone', null]) {
      expect(toSmsAddress(bad), String(bad)).toBeNull()
    }
  })
})

describe('the send', () => {
  it('posts the form Twilio expects and returns the SID', async () => {
    const fetchMock = twilioAccepting()
    vi.stubGlobal('fetch', fetchMock)

    const result = await sendSms({
      to: '+972501234567',
      body: 'הקופון שלך מוכן',
      statusCallback: 'https://kenyonexpress.co.il/api/webhooks/twilio-sms',
      env: ENV,
    })

    expect(result).toMatchObject({ ok: true, sid: 'SM1' })
    const call = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ]
    expect(call[0]).toBe('https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json')
    const body = new URLSearchParams(String(call[1].body))
    expect(body.get('From')).toBe('KenyonExp')
    expect(body.get('To')).toBe('+972501234567')
    expect(body.get('Body')).toBe('הקופון שלך מוכן')
    expect(body.get('StatusCallback')).toBe('https://kenyonexpress.co.il/api/webhooks/twilio-sms')
    expect(
      String(call[1].headers && (call[1].headers as Record<string, string>).Authorization),
    ).toMatch(/^Basic /)
  })

  it('omits StatusCallback when there is nowhere to send it', async () => {
    const fetchMock = twilioAccepting()
    vi.stubGlobal('fetch', fetchMock)
    await sendSms({ to: '+972501234567', body: 'שלום', env: ENV })

    const call = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ]
    expect(new URLSearchParams(String(call[1].body)).has('StatusCallback')).toBe(false)
  })

  it('prefers Twilio’s own segment count, because that is what is billed', async () => {
    vi.stubGlobal('fetch', twilioAccepting({ sid: 'SM1', num_segments: '3' }))
    const result = await sendSms({ to: '+972501234567', body: 'שלום', env: ENV })
    expect(result).toMatchObject({ segments: 3 })
  })

  it('falls back to its own count when Twilio reports none', async () => {
    vi.stubGlobal('fetch', twilioAccepting({ sid: 'SM1' }))
    // 140 Hebrew characters: three segments, which is the number a naive
    // "under 160" estimate gets wrong by 200%.
    const result = await sendSms({ to: '+972501234567', body: 'א'.repeat(140), env: ENV })
    expect(result).toMatchObject({ segments: 3 })
  })

  it('reports an API rejection as an error, not a skip', async () => {
    // Only `skipped` means "do not retry and do not count an attempt".
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 400,
        text: async () => '{"code":21606,"message":"not a valid sender"}',
      })) as unknown as typeof fetch,
    )

    const result = await sendSms({ to: '+972501234567', body: 'שלום', env: ENV })
    expect(result.ok).toBe(false)
    // Not a skip: the difference decides whether the caller retries and whether
    // the attempt is counted.
    expect('skipped' in result && result.skipped).toBeFalsy()
    expect(result).toMatchObject({ error: expect.stringContaining('21606') })
  })

  it('reports a network failure as an error rather than throwing', async () => {
    // Every caller sits after something that already happened. An unreachable
    // provider must not fail that flow.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed')
      }) as unknown as typeof fetch,
    )

    const result = await sendSms({ to: '+972501234567', body: 'שלום', env: ENV })
    expect(result).toMatchObject({ ok: false, error: 'fetch failed' })
  })
})
