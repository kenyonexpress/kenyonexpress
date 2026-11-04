import { describe, expect, it, vi } from 'vitest'
import {
  buildOtpTemplatePayload,
  otpChannel,
  sendWhatsAppOtp,
  whatsappCloudConfig,
} from './whatsapp-cloud'

const FULL = {
  WHATSAPP_CLOUD_TOKEN: 'EAAGtoken',
  WHATSAPP_CLOUD_PHONE_NUMBER_ID: '123456789012345',
  WHATSAPP_OTP_SECRET: 's'.repeat(32),
} as unknown as NodeJS.ProcessEnv

describe('which channel the code form uses', () => {
  it('is WhatsApp only with token, phone number id and secret all present', () => {
    expect(otpChannel(FULL)).toBe('whatsapp')
  })

  it.each(['WHATSAPP_CLOUD_TOKEN', 'WHATSAPP_CLOUD_PHONE_NUMBER_ID', 'WHATSAPP_OTP_SECRET'])(
    'falls back to email when %s is missing',
    (key) => {
      const env = { ...FULL, [key]: undefined } as unknown as NodeJS.ProcessEnv
      expect(otpChannel(env)).toBe('email')
    },
  )

  it('falls back to email on an empty env, a short secret or placeholder values', () => {
    expect(otpChannel({} as NodeJS.ProcessEnv)).toBe('email')
    expect(otpChannel({ ...FULL, WHATSAPP_OTP_SECRET: 'short' } as NodeJS.ProcessEnv)).toBe('email')
    expect(otpChannel({ ...FULL, WHATSAPP_CLOUD_TOKEN: '[SENSITIVE]' } as NodeJS.ProcessEnv)).toBe(
      'email',
    )
    expect(
      otpChannel({ ...FULL, WHATSAPP_CLOUD_PHONE_NUMBER_ID: '[SENSITIVE]' } as NodeJS.ProcessEnv),
    ).toBe('email')
  })

  it('defaults the template, language and Graph version', () => {
    expect(whatsappCloudConfig(FULL)).toMatchObject({
      template: 'login_code',
      language: 'he',
      apiVersion: 'v21.0',
    })
  })
})

describe('the Meta authentication template payload', () => {
  it('puts the code in the body and the copy-code button, number without the plus', () => {
    const payload = buildOtpTemplatePayload({
      e164: '+972501234567',
      code: '654321',
      template: 'login_code',
      language: 'he',
    })
    expect(payload.to).toBe('972501234567')
    expect(payload.type).toBe('template')
    expect(payload.template.components).toEqual([
      { type: 'body', parameters: [{ type: 'text', text: '654321' }] },
      {
        type: 'button',
        sub_type: 'url',
        index: '0',
        parameters: [{ type: 'text', text: '654321' }],
      },
    ])
  })
})

describe('sending through Graph', () => {
  const config = whatsappCloudConfig(FULL)
  if (!config) throw new Error('config fixture')

  it('POSTs to the phone number id with the bearer token', async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ messages: [{ id: 'wamid.X' }] }), { status: 200 }),
    )
    const result = await sendWhatsAppOtp(
      config,
      '+972501234567',
      '000111',
      fetchImpl as typeof fetch,
    )
    expect(result).toEqual({ ok: true, messageId: 'wamid.X' })
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://graph.facebook.com/v21.0/123456789012345/messages')
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer EAAGtoken')
    expect(JSON.parse(String(init.body)).template.name).toBe('login_code')
  })

  it('reports the Graph error code, never the message', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { code: 131008, message: 'secret WABA detail' } }), {
          status: 400,
        }),
    )
    const result = await sendWhatsAppOtp(
      config,
      '+972501234567',
      '000111',
      fetchImpl as typeof fetch,
    )
    expect(result).toEqual({ ok: false, reason: 'graph_400_131008' })
  })

  it('turns a network failure into ok:false instead of throwing', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('fetch failed')
    })
    const result = await sendWhatsAppOtp(
      config,
      '+972501234567',
      '000111',
      fetchImpl as typeof fetch,
    )
    expect(result).toEqual({ ok: false, reason: 'TypeError' })
  })
})
