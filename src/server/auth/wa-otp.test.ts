import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
const { hashOtp, newOtpCode, otpMatches } = await import('./wa-otp')
const env = {
  SUPABASE_SECRET_KEY: 'sb_secret_test_key_long_enough',
} as unknown as NodeJS.ProcessEnv

describe('WhatsApp sign-in codes', () => {
  it('are six digits', () => {
    for (let i = 0; i < 50; i += 1) expect(newOtpCode()).toMatch(/^[0-9]{6}$/)
  })

  it('match only the same code for the same phone', () => {
    const stored = hashOtp('+972501234567', '123456', env)
    expect(otpMatches('+972501234567', '123456', stored, env)).toBe(true)
    expect(otpMatches('+972501234567', '123457', stored, env)).toBe(false)
    expect(otpMatches('+972509999999', '123456', stored, env)).toBe(false)
    expect(otpMatches('+972501234567', '12345', stored, env)).toBe(false)
  })
})

describe('limits', () => {
  it('allows three attempts', async () => {
    const m = await import('./wa-otp')
    expect(m.WA_OTP_MAX_ATTEMPTS).toBe(3)
    expect(m.WA_OTP_TTL_MS).toBe(600000)
  })
})
