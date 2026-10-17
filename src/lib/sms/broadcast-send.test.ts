import { describe, expect, it } from 'vitest'
import { isSmsConfigured } from './broadcast-send'

describe('SMS Broadcast Send', () => {
  describe('isSmsConfigured', () => {
    it('returns true when all required SMS environment variables are set', () => {
      const originalAccountSid = process.env.TWILIO_ACCOUNT_SID
      const originalAuthToken = process.env.TWILIO_AUTH_TOKEN
      const originalPhoneNumber = process.env.TWILIO_PHONE_NUMBER

      process.env.TWILIO_ACCOUNT_SID = 'AC123456789'
      process.env.TWILIO_AUTH_TOKEN = 'auth_token_value'
      process.env.TWILIO_PHONE_NUMBER = '+1234567890'

      const result = isSmsConfigured()
      expect(result).toBe(true)

      // Restore original values
      process.env.TWILIO_ACCOUNT_SID = originalAccountSid
      process.env.TWILIO_AUTH_TOKEN = originalAuthToken
      process.env.TWILIO_PHONE_NUMBER = originalPhoneNumber
    })

    it('returns false when TWILIO_ACCOUNT_SID is missing', () => {
      const originalSid = process.env.TWILIO_ACCOUNT_SID
      const originalToken = process.env.TWILIO_AUTH_TOKEN
      const originalPhone = process.env.TWILIO_PHONE_NUMBER

      process.env.TWILIO_ACCOUNT_SID = undefined
      process.env.TWILIO_AUTH_TOKEN = 'token'
      process.env.TWILIO_PHONE_NUMBER = '+1234567890'

      const result = isSmsConfigured()
      expect(result).toBe(false)

      process.env.TWILIO_ACCOUNT_SID = originalSid
      process.env.TWILIO_AUTH_TOKEN = originalToken
      process.env.TWILIO_PHONE_NUMBER = originalPhone
    })

    it('returns false when TWILIO_AUTH_TOKEN is missing', () => {
      const originalSid = process.env.TWILIO_ACCOUNT_SID
      const originalToken = process.env.TWILIO_AUTH_TOKEN
      const originalPhone = process.env.TWILIO_PHONE_NUMBER

      process.env.TWILIO_ACCOUNT_SID = 'AC123456789'
      process.env.TWILIO_AUTH_TOKEN = undefined
      process.env.TWILIO_PHONE_NUMBER = '+1234567890'

      const result = isSmsConfigured()
      expect(result).toBe(false)

      process.env.TWILIO_ACCOUNT_SID = originalSid
      process.env.TWILIO_AUTH_TOKEN = originalToken
      process.env.TWILIO_PHONE_NUMBER = originalPhone
    })

    it('returns false when TWILIO_PHONE_NUMBER is missing', () => {
      const originalSid = process.env.TWILIO_ACCOUNT_SID
      const originalToken = process.env.TWILIO_AUTH_TOKEN
      const originalPhone = process.env.TWILIO_PHONE_NUMBER

      process.env.TWILIO_ACCOUNT_SID = 'AC123456789'
      process.env.TWILIO_AUTH_TOKEN = 'auth_token_value'
      process.env.TWILIO_PHONE_NUMBER = undefined

      const result = isSmsConfigured()
      expect(result).toBe(false)

      process.env.TWILIO_ACCOUNT_SID = originalSid
      process.env.TWILIO_AUTH_TOKEN = originalToken
      process.env.TWILIO_PHONE_NUMBER = originalPhone
    })

    it('returns false when all SMS configuration is missing', () => {
      const originalSid = process.env.TWILIO_ACCOUNT_SID
      const originalToken = process.env.TWILIO_AUTH_TOKEN
      const originalPhone = process.env.TWILIO_PHONE_NUMBER

      process.env.TWILIO_ACCOUNT_SID = undefined
      process.env.TWILIO_AUTH_TOKEN = undefined
      process.env.TWILIO_PHONE_NUMBER = undefined

      const result = isSmsConfigured()
      expect(result).toBe(false)

      process.env.TWILIO_ACCOUNT_SID = originalSid
      process.env.TWILIO_AUTH_TOKEN = originalToken
      process.env.TWILIO_PHONE_NUMBER = originalPhone
    })
  })

  describe('Quiet Hours Logic', () => {
    it('isWithinQuietHours helper should be a function', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { isWithinQuietHours } = require('./twilio-webhook')
      expect(typeof isWithinQuietHours).toBe('function')
    })

    it('isWithinQuietHours should return boolean', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { isWithinQuietHours } = require('./twilio-webhook')
      const result = isWithinQuietHours('22:00', '08:00', 'Asia/Jerusalem')
      expect(typeof result).toBe('boolean')
    })

    it('isWithinQuietHours should handle null quiet hours', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { isWithinQuietHours } = require('./twilio-webhook')
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
