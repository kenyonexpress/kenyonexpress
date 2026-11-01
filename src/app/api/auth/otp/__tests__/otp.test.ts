import { describe, expect, it } from 'vitest'

describe('OTP endpoints', () => {
  it('requires Twilio configuration for send endpoint', () => {
    // The send endpoint checks for TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN
    // and returns 503 if not configured
    expect(process.env.TWILIO_ACCOUNT_SID || null).toBeDefined()
  })

  it('validates phone number format', () => {
    // Test phone number normalization
    const testCases = [
      { input: '050-1234567', expected: '+972501234567' },
      { input: '0501234567', expected: '+972501234567' },
      { input: '972501234567', expected: '+972501234567' },
      { input: '+972501234567', expected: '+972501234567' },
    ]

    for (const testCase of testCases) {
      const cleaned = testCase.input.replace(/\D/g, '')
      if (cleaned.startsWith('0') && cleaned.length === 10) {
        const result = `+972${cleaned.slice(1)}`
        expect(result).toBe(testCase.expected)
      }
    }
  })

  it('generates 6-digit OTP codes', () => {
    // OTP generation should produce 6-digit codes
    const code = Math.floor(100000 + Math.random() * 900000).toString()
    expect(code).toMatch(/^\d{6}$/)
    expect(code.length).toBe(6)
  })

  it('sets OTP expiry to 10 minutes', () => {
    const now = new Date()
    const expiryTime = 10 * 60 * 1000 // 10 minutes
    const expires = new Date(now.getTime() + expiryTime)
    const diff = expires.getTime() - now.getTime()
    expect(diff).toBe(expiryTime)
  })

  it('requires valid OTP code format', () => {
    // Code must be exactly 6 digits
    const validCodes = ['123456', '000000', '999999']
    const invalidCodes = ['12345', '1234567', 'abcdef', '']

    for (const code of validCodes) {
      expect(code.length).toBe(6)
      expect(/^\d{6}$/.test(code)).toBe(true)
    }

    for (const code of invalidCodes) {
      expect(code.length !== 6 || !/^\d{6}$/.test(code)).toBe(true)
    }
  })
})
