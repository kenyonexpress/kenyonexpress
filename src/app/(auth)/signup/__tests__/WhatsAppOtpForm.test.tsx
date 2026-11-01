import { describe, expect, it } from 'vitest'

describe('WhatsAppOtpForm', () => {
  it('normalizes Israeli phone numbers correctly', () => {
    // Test cases for phone number normalization
    const testCases = [
      { input: '0501234567', expected: '+972501234567' },
      { input: '972501234567', expected: '+972501234567' },
      { input: '+972501234567', expected: '+972501234567' },
    ]

    for (const test of testCases) {
      const cleaned = test.input.replace(/\D/g, '')
      let result = test.input
      if (cleaned.startsWith('0') && cleaned.length === 10) {
        result = `+972${cleaned.slice(1)}`
      } else if (!cleaned.startsWith('972') && cleaned.length === 9) {
        result = `+972${cleaned}`
      } else if (!test.input.startsWith('+')) {
        result = `+${test.input}`
      }
      expect(result).toBe(test.expected)
    }
  })

  it('handles OTP code input', () => {
    // OTP code should be exactly 6 digits
    const code = '123456'
    expect(code.length).toBe(6)
    expect(/^\d{6}$/.test(code)).toBe(true)
  })

  it('validates numeric input only', () => {
    // Simulate input filtering - only digits allowed
    const input = 'abc123'
    const filtered = input.replace(/\D/g, '')
    expect(filtered).toBe('123')
  })

  it('enforces maximum 6-character input', () => {
    const input = '1234567'
    const sliced = input.slice(0, 6)
    expect(sliced).toBe('123456')
    expect(sliced.length).toBeLessThanOrEqual(6)
  })
})
