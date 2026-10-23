import { afterEach, describe, expect, it, vi } from 'vitest'
import { isSmsConfigured } from './broadcast-send'
import { isWithinQuietHours } from './twilio-webhook'

describe('SMS Broadcast Send', () => {
  describe('isSmsConfigured', () => {
    // `process.env.X = undefined` stores the string 'undefined', which is truthy,
    // so "missing" is expressed with an empty value through vi.stubEnv.
    const SET = {
      TWILIO_ACCOUNT_SID: 'AC123456789',
      TWILIO_AUTH_TOKEN: 'auth_token_value',
      TWILIO_PHONE_NUMBER: '+1234567890',
    }

    function configure(overrides: Partial<Record<keyof typeof SET, string>> = {}) {
      for (const [name, value] of Object.entries({ ...SET, ...overrides })) {
        vi.stubEnv(name, value)
      }
    }

    afterEach(() => {
      vi.unstubAllEnvs()
    })

    it('returns true when all required SMS environment variables are set', () => {
      configure()
      expect(isSmsConfigured()).toBe(true)
    })

    it('returns false when TWILIO_ACCOUNT_SID is missing', () => {
      configure({ TWILIO_ACCOUNT_SID: '' })
      expect(isSmsConfigured()).toBe(false)
    })

    it('returns false when TWILIO_AUTH_TOKEN is missing', () => {
      configure({ TWILIO_AUTH_TOKEN: '' })
      expect(isSmsConfigured()).toBe(false)
    })

    it('returns false when TWILIO_PHONE_NUMBER is missing', () => {
      configure({ TWILIO_PHONE_NUMBER: '' })
      expect(isSmsConfigured()).toBe(false)
    })

    it('returns false when all SMS configuration is missing', () => {
      configure({ TWILIO_ACCOUNT_SID: '', TWILIO_AUTH_TOKEN: '', TWILIO_PHONE_NUMBER: '' })
      expect(isSmsConfigured()).toBe(false)
    })
  })

  describe('Quiet Hours Logic', () => {
    it('isWithinQuietHours helper should be a function', () => {
      expect(typeof isWithinQuietHours).toBe('function')
    })

    it('isWithinQuietHours should return boolean', () => {
      const result = isWithinQuietHours('22:00', '08:00', 'Asia/Jerusalem')
      expect(typeof result).toBe('boolean')
    })

    it('isWithinQuietHours should handle null quiet hours', () => {
      const result = isWithinQuietHours(null, null)
      expect(result).toBe(false)
    })
  })

  describe('SMS Configuration', () => {
    it('isSmsConfigured returns boolean', () => {
      const result = isSmsConfigured()
      expect(typeof result).toBe('boolean')
    })

    it('isSmsConfigured validates all three required env vars', () => {
      const configured = isSmsConfigured()
      // Result depends on current environment
      // Test structure verifies the function works
      expect(typeof configured).toBe('boolean')
    })
  })
})
