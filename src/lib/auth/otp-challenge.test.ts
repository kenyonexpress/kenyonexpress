import { describe, expect, it } from 'vitest'
import { OTP_TTL_SECONDS, generateOtpCode, issueChallenge, verifyChallenge } from './otp-challenge'

const SECRET = 'a'.repeat(40)
const PHONE = '+972501234567'
const T0 = Date.UTC(2026, 10, 4, 10, 0, 0)

describe('the signed OTP challenge', () => {
  it('generates six digits, leading zeros kept', () => {
    for (let i = 0; i < 200; i += 1) expect(generateOtpCode()).toMatch(/^\d{6}$/)
  })

  it('accepts the right code for the right number before expiry', () => {
    const challenge = issueChallenge({ subject: PHONE, code: '012345', secret: SECRET, now: T0 })
    expect(
      verifyChallenge({ challenge, subject: PHONE, code: '012345', secret: SECRET, now: T0 }),
    ).toBe('ok')
  })

  it('refuses a wrong code, a different number and a different secret', () => {
    const challenge = issueChallenge({ subject: PHONE, code: '111111', secret: SECRET, now: T0 })
    const base = { challenge, subject: PHONE, code: '111111', secret: SECRET, now: T0 }
    expect(verifyChallenge({ ...base, code: '111112' })).toBe('mismatch')
    expect(verifyChallenge({ ...base, subject: '+972509999999' })).toBe('mismatch')
    expect(verifyChallenge({ ...base, secret: 'b'.repeat(40) })).toBe('mismatch')
  })

  it('expires after the TTL', () => {
    const challenge = issueChallenge({ subject: PHONE, code: '222222', secret: SECRET, now: T0 })
    const later = T0 + (OTP_TTL_SECONDS + 1) * 1000
    expect(
      verifyChallenge({ challenge, subject: PHONE, code: '222222', secret: SECRET, now: later }),
    ).toBe('expired')
  })

  it('refuses a payload whose expiry was rewritten, because the MAC covers it', () => {
    const challenge = issueChallenge({ subject: PHONE, code: '333333', secret: SECRET, now: T0 })
    const [, sig] = challenge.split('.')
    const forged = `${Buffer.from(JSON.stringify({ s: PHONE, e: 9_999_999_999 })).toString('base64url')}.${sig}`
    expect(
      verifyChallenge({
        challenge: forged,
        subject: PHONE,
        code: '333333',
        secret: SECRET,
        now: T0,
      }),
    ).toBe('mismatch')
  })

  it('calls a missing or garbled cookie malformed', () => {
    const base = { subject: PHONE, code: '444444', secret: SECRET, now: T0 }
    expect(verifyChallenge({ ...base, challenge: undefined })).toBe('malformed')
    expect(verifyChallenge({ ...base, challenge: 'nodot' })).toBe('malformed')
    expect(verifyChallenge({ ...base, challenge: '!!!.abc' })).toBe('malformed')
  })
})
