import { afterEach, describe, expect, it, vi } from 'vitest'
import { sendSmsOtp } from './send-otp-sms'

const env = {
  TWILIO_ACCOUNT_SID: 'ACtest',
  TWILIO_AUTH_TOKEN: 'tok',
  TWILIO_PHONE_NUMBER: '+15005550006',
} as unknown as NodeJS.ProcessEnv

afterEach(() => vi.unstubAllGlobals())

describe('sendSmsOtp', () => {
  it('skips when Twilio is not configured', async () => {
    expect(await sendSmsOtp('+972501234567', '123456', {} as NodeJS.ProcessEnv)).toMatchObject({
      ok: false,
      skipped: true,
    })
  })

  it('posts the code to Twilio and reports success', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await sendSmsOtp('+972501234567', '123456', env)).toEqual({ ok: true })
    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(String(url)).toContain('/Accounts/ACtest/Messages.json')
    expect(String(init?.body)).toContain('123456')
  })

  it('reports a Twilio error without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 400 })))
    expect(await sendSmsOtp('+972501234567', '123456', env)).toMatchObject({
      ok: false,
      reason: 'twilio_400',
    })
  })
})
