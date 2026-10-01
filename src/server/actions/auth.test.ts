import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const checkRateLimit = vi.hoisted(() => vi.fn())
const getClientIp = vi.hoisted(() => vi.fn())
const signInWithOtp = vi.hoisted(() => vi.fn())

vi.mock('@/lib/utils/rate-limit', () => ({ checkRateLimit, getClientIp }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { signInWithOtp } }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  // Empty candidate list -> `decidePhoneMerge` returns `action: 'none'`, so
  // `attachPhoneToExistingAccount` never reaches `auth.admin.updateUserById`.
  // That keeps this mock to exactly what the merge lookup touches.
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        ilike: () => ({
          limit: async () => ({ data: [] }),
        }),
      }),
    }),
  }),
}))

import { sendPhoneOtp, signInWithEmail } from './auth'

function form(fields: Record<string, string>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.set(key, value)
  return data
}

/**
 * `checkRateLimit` runs before any Supabase call in `runSignInWithEmail`, so a
 * rejection here never needs a mocked client: both ceilings (per-IP `login`,
 * per-account `login-account`) must be provably enforced without one, because
 * `checkout.test.ts` had this exact check permanently stubbed to `true` and
 * `redeem` had no test at all — M13-c51.
 */
describe('signInWithEmail rate limiting', () => {
  beforeEach(() => {
    checkRateLimit.mockReset()
    getClientIp.mockReset()
    getClientIp.mockResolvedValue('1.2.3.4')
  })

  it('rejects when the per-IP login ceiling is hit, before touching credentials', async () => {
    checkRateLimit.mockResolvedValue(false)
    const result = await signInWithEmail(
      null,
      form({ email: 'dani@example.com', password: 'hunter2' }),
    )
    expect(result).toEqual({ error: 'יותר מדי ניסיונות כניסה — נסו שוב בעוד שעה' })
    expect(checkRateLimit).toHaveBeenCalledWith('login:1.2.3.4')
  })

  it('rejects when the per-account ceiling is hit even under the IP ceiling', async () => {
    checkRateLimit.mockImplementation(async (key: string) => !key.startsWith('login-account:'))
    const result = await signInWithEmail(
      null,
      form({ email: 'Dani@Example.com', password: 'hunter2' }),
    )
    expect(result).toEqual({ error: 'יותר מדי ניסיונות כניסה — נסו שוב בעוד שעה' })
    // Lower-cased, so `Dani@Example.com` and `dani@example.com` share one budget.
    expect(checkRateLimit).toHaveBeenCalledWith('login-account:dani@example.com', 20, 3600)
  })
})

/**
 * WhatsApp is tried first, and SMS is the automatic fallback IN THE SAME
 * REQUEST, same shape as the branded-email-then-Supabase-SMTP fallback on
 * password reset (`runSendPasswordReset`). `WHATSAPP_OTP_ENABLED` defaults off
 * (`src/lib/auth/phone-otp.ts`), so the no-env-var case must reproduce
 * yesterday's SMS-only behaviour exactly - that is the regression these tests
 * actually guard against, not the happy path of a flag nobody has flipped on
 * production yet.
 */
describe('sendPhoneOtp channel fallback', () => {
  const ENV_KEYS = ['PHONE_AUTH_ENABLED', 'WHATSAPP_OTP_ENABLED'] as const
  const savedEnv: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const key of ENV_KEYS) savedEnv[key] = process.env[key]
    process.env.PHONE_AUTH_ENABLED = 'true'
    checkRateLimit.mockReset()
    getClientIp.mockReset()
    getClientIp.mockResolvedValue('1.2.3.4')
    checkRateLimit.mockResolvedValue(true)
    signInWithOtp.mockReset()
  })

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined) delete process.env[key]
      else process.env[key] = savedEnv[key]
    }
  })

  it('sends only over SMS while the WhatsApp flag is off, unchanged from before this flag existed', async () => {
    process.env.WHATSAPP_OTP_ENABLED = 'false'
    signInWithOtp.mockResolvedValue({ error: null })

    const result = await sendPhoneOtp(null, form({ phone: '0501234567' }))

    expect(result).toEqual({ success: '+972501234567', channel: 'sms' })
    expect(signInWithOtp).toHaveBeenCalledTimes(1)
    expect(signInWithOtp).toHaveBeenCalledWith({
      phone: '+972501234567',
      options: { channel: 'sms' },
    })
  })

  it('reports whatsapp and sends only once when the flag is on and WhatsApp succeeds', async () => {
    process.env.WHATSAPP_OTP_ENABLED = 'true'
    signInWithOtp.mockResolvedValue({ error: null })

    const result = await sendPhoneOtp(null, form({ phone: '0501234567' }))

    expect(result).toEqual({ success: '+972501234567', channel: 'whatsapp' })
    expect(signInWithOtp).toHaveBeenCalledTimes(1)
    expect(signInWithOtp).toHaveBeenCalledWith({
      phone: '+972501234567',
      options: { channel: 'whatsapp' },
    })
  })

  it('falls back to SMS in the same request when the WhatsApp attempt errors', async () => {
    process.env.WHATSAPP_OTP_ENABLED = 'true'
    signInWithOtp
      .mockResolvedValueOnce({ error: { message: 'Unsupported phone provider' } })
      .mockResolvedValueOnce({ error: null })

    const result = await sendPhoneOtp(null, form({ phone: '0501234567' }))

    expect(result).toEqual({ success: '+972501234567', channel: 'sms' })
    expect(signInWithOtp).toHaveBeenCalledTimes(2)
    expect(signInWithOtp).toHaveBeenNthCalledWith(1, {
      phone: '+972501234567',
      options: { channel: 'whatsapp' },
    })
    expect(signInWithOtp).toHaveBeenNthCalledWith(2, {
      phone: '+972501234567',
      options: { channel: 'sms' },
    })
  })

  it('still surfaces a Hebrew error when both channels fail', async () => {
    process.env.WHATSAPP_OTP_ENABLED = 'true'
    signInWithOtp.mockResolvedValue({ error: { message: 'Unsupported phone provider' } })

    const result = await sendPhoneOtp(null, form({ phone: '0501234567' }))

    expect(result).toEqual({ error: 'שליחת SMS אינה זמינה כרגע' })
    expect(signInWithOtp).toHaveBeenCalledTimes(2)
  })
})
