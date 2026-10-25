import { describe, expect, it } from 'vitest'
import { isDisposableEmail } from './signup-validation'

describe('signup-validation', () => {
  describe('isDisposableEmail', () => {
    it('detects disposable email domains', () => {
      expect(isDisposableEmail('test@mailinator.com')).toBe(true)
      expect(isDisposableEmail('user@tempmail.com')).toBe(true)
      expect(isDisposableEmail('spam@guerrillamail.com')).toBe(true)
      expect(isDisposableEmail('fake@10minutemail.com')).toBe(true)
    })

    it('allows legitimate email domains', () => {
      expect(isDisposableEmail('user@gmail.com')).toBe(false)
      expect(isDisposableEmail('admin@company.co.il')).toBe(false)
      expect(isDisposableEmail('info@example.org')).toBe(false)
    })

    it('is case-insensitive', () => {
      expect(isDisposableEmail('TEST@MAILINATOR.COM')).toBe(true)
      expect(isDisposableEmail('User@TempMail.com')).toBe(true)
    })

    it('handles invalid email formats gracefully', () => {
      expect(isDisposableEmail('notanemail')).toBe(false)
      expect(isDisposableEmail('@nodomain.com')).toBe(false)
      expect(isDisposableEmail('')).toBe(false)
    })
  })
})
