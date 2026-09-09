import { describe, expect, it } from 'vitest'
import { isSmsConfigured, sendSms, toSmsAddress } from './twilio'

const ENV = (over: Record<string, string> = {}) =>
  ({
    TWILIO_ACCOUNT_SID: 'AC123',
    TWILIO_AUTH_TOKEN: 'secret',
    ...over,
  }) as unknown as NodeJS.ProcessEnv

describe('configuration', () => {
  it('needs its own sender variable, not WhatsApp&apos;s', () => {
    // Sharing `TWILIO_WHATSAPP_FROM` would mean configuring WhatsApp silently
    // enabled SMS from a number not approved to send it. Different
    // registrations, different variables.
    expect(isSmsConfigured(ENV({ TWILIO_WHATSAPP_FROM: 'whatsapp:+14155238886' }))).toBe(false)
    expect(isSmsConfigured(ENV({ TWILIO_SMS_FROM: 'KENYON' }))).toBe(true)
  })

  it('is unconfigured with no credentials at all', () => {
    expect(isSmsConfigured({} as NodeJS.ProcessEnv)).toBe(false)
  })
})

describe('normalising an Israeli mobile', () => {
  it('accepts the forms the profiles table actually holds', () => {
    expect(toSmsAddress('052-463-5550')).toBe('+972524635550')
    expect(toSmsAddress('0524635550')).toBe('+972524635550')
    expect(toSmsAddress('972524635550')).toBe('+972524635550')
    expect(toSmsAddress('+972524635550')).toBe('+972524635550')
  })

  it('refuses anything else rather than guessing', () => {
    // A message pushed to a wrong number is worse than one not sent.
    expect(toSmsAddress('123')).toBeNull()
    expect(toSmsAddress('+14155238886')).toBeNull()
    expect(toSmsAddress(null)).toBeNull()
    expect(toSmsAddress('03-1234567')).toBeNull()
  })
})

describe('sending', () => {
  it('skips with a reason when no sender is configured', async () => {
    // `skipped`, not `error`, matching the WhatsApp result and the invoice
    // queue: only "we tried and it failed" is worth retrying.
    const result = await sendSms({ to: '+972524635550', body: 'x', env: ENV() })
    expect(result).toMatchObject({ ok: false, skipped: true })
    expect(result.ok === false && 'reason' in result && result.reason).toMatch(/TWILIO_SMS_FROM/)
  })

  it('still refuses when configured, and says why', async () => {
    // The stub is a stub even with credentials. Posting from an unregistered
    // Israeli sender returns `queued`, then `delivered`, and the phone never
    // rings -- an implementation that looked correct here would be exactly that
    // invisible failure.
    const result = await sendSms({
      to: '+972524635550',
      body: 'x',
      env: ENV({ TWILIO_SMS_FROM: 'KENYON' }),
    })
    expect(result).toMatchObject({ ok: false, skipped: true })
    expect(result.ok === false && 'reason' in result && result.reason).toMatch(/sender ID/)
  })
})
