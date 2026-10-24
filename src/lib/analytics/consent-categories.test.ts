import { describe, expect, it } from 'vitest'
import {
  CONSENT_CATEGORIES,
  type GranularConsent,
  getAcceptAllConsent,
  getDefaultConsent,
  getRejectAllConsent,
  isCategoryAllowed,
  parseGranularConsent,
  serializeGranularConsent,
} from './consent-categories'

describe('consent-categories', () => {
  describe('serializeGranularConsent', () => {
    it('serializes accept all as 1.1.1.2', () => {
      const consent: GranularConsent = {
        essential: true,
        analytics: true,
        marketing: true,
        wordingVersion: 2,
      }
      expect(serializeGranularConsent(consent)).toBe('1.1.1.2')
    })

    it('serializes reject all as 1.0.0.2', () => {
      const consent: GranularConsent = {
        essential: true,
        analytics: false,
        marketing: false,
        wordingVersion: 2,
      }
      expect(serializeGranularConsent(consent)).toBe('1.0.0.2')
    })

    it('serializes analytics only as 1.1.0.2', () => {
      const consent: GranularConsent = {
        essential: true,
        analytics: true,
        marketing: false,
        wordingVersion: 2,
      }
      expect(serializeGranularConsent(consent)).toBe('1.1.0.2')
    })

    it('serializes marketing only as 1.0.1.2', () => {
      const consent: GranularConsent = {
        essential: true,
        analytics: false,
        marketing: true,
        wordingVersion: 2,
      }
      expect(serializeGranularConsent(consent)).toBe('1.0.1.2')
    })
  })

  describe('parseGranularConsent', () => {
    it('parses valid accept all cookie', () => {
      const result = parseGranularConsent('1.1.1.2')
      expect(result).toEqual({
        essential: true,
        analytics: true,
        marketing: true,
        wordingVersion: 2,
      })
    })

    it('parses valid reject all cookie', () => {
      const result = parseGranularConsent('1.0.0.2')
      expect(result).toEqual({
        essential: true,
        analytics: false,
        marketing: false,
        wordingVersion: 2,
      })
    })

    it('parses analytics only', () => {
      const result = parseGranularConsent('1.1.0.2')
      expect(result).toEqual({
        essential: true,
        analytics: true,
        marketing: false,
        wordingVersion: 2,
      })
    })

    it('returns null for empty string', () => {
      expect(parseGranularConsent('')).toBeNull()
    })

    it('returns null for undefined', () => {
      expect(parseGranularConsent(undefined)).toBeNull()
    })

    it('returns null for null', () => {
      expect(parseGranularConsent(null)).toBeNull()
    })

    it('returns null for invalid format (too few parts)', () => {
      expect(parseGranularConsent('1.1.2')).toBeNull()
    })

    it('returns null for invalid format (too many parts)', () => {
      expect(parseGranularConsent('1.1.0.2.extra')).toBeNull()
    })

    it('returns null for invalid boolean values', () => {
      expect(parseGranularConsent('2.1.0.2')).toBeNull()
      expect(parseGranularConsent('1.2.0.2')).toBeNull()
      expect(parseGranularConsent('1.1.2.2')).toBeNull()
    })

    it('returns null for invalid version', () => {
      expect(parseGranularConsent('1.1.0.abc')).toBeNull()
      expect(parseGranularConsent('1.1.0.0')).toBeNull()
      expect(parseGranularConsent('1.1.0.-1')).toBeNull()
    })
  })

  describe('isCategoryAllowed', () => {
    const VERSION = 2

    it('returns true for analytics when analytics granted', () => {
      expect(isCategoryAllowed('1.1.0.2', CONSENT_CATEGORIES.analytics, VERSION)).toBe(true)
    })

    it('returns false for analytics when analytics denied', () => {
      expect(isCategoryAllowed('1.0.0.2', CONSENT_CATEGORIES.analytics, VERSION)).toBe(false)
    })

    it('returns true for marketing when marketing granted', () => {
      expect(isCategoryAllowed('1.0.1.2', CONSENT_CATEGORIES.marketing, VERSION)).toBe(true)
    })

    it('returns false for marketing when marketing denied', () => {
      expect(isCategoryAllowed('1.0.0.2', CONSENT_CATEGORIES.marketing, VERSION)).toBe(false)
    })

    it('returns true for essential always', () => {
      expect(isCategoryAllowed('1.0.0.2', CONSENT_CATEGORIES.essential, VERSION)).toBe(true)
      expect(isCategoryAllowed('1.1.1.2', CONSENT_CATEGORIES.essential, VERSION)).toBe(true)
    })

    it('returns false for stale wording version', () => {
      expect(isCategoryAllowed('1.1.1.1', CONSENT_CATEGORIES.analytics, VERSION)).toBe(false)
      expect(isCategoryAllowed('1.1.1.1', CONSENT_CATEGORIES.marketing, VERSION)).toBe(false)
    })

    it('returns false for invalid cookie', () => {
      expect(isCategoryAllowed('invalid', CONSENT_CATEGORIES.analytics, VERSION)).toBe(false)
      expect(isCategoryAllowed(null, CONSENT_CATEGORIES.analytics, VERSION)).toBe(false)
      expect(isCategoryAllowed(undefined, CONSENT_CATEGORIES.analytics, VERSION)).toBe(false)
    })
  })

  describe('getDefaultConsent', () => {
    it('returns all denied except essential', () => {
      const result = getDefaultConsent(2)
      expect(result).toEqual({
        essential: true,
        analytics: false,
        marketing: false,
        wordingVersion: 2,
      })
    })
  })

  describe('getAcceptAllConsent', () => {
    it('returns all granted', () => {
      const result = getAcceptAllConsent(2)
      expect(result).toEqual({
        essential: true,
        analytics: true,
        marketing: true,
        wordingVersion: 2,
      })
    })
  })

  describe('getRejectAllConsent', () => {
    it('returns all denied except essential', () => {
      const result = getRejectAllConsent(2)
      expect(result).toEqual({
        essential: true,
        analytics: false,
        marketing: false,
        wordingVersion: 2,
      })
    })
  })

  describe('round-trip serialization', () => {
    it('preserves accept all through serialize and parse', () => {
      const original = getAcceptAllConsent(2)
      const serialized = serializeGranularConsent(original)
      const parsed = parseGranularConsent(serialized)
      expect(parsed).toEqual(original)
    })

    it('preserves reject all through serialize and parse', () => {
      const original = getRejectAllConsent(2)
      const serialized = serializeGranularConsent(original)
      const parsed = parseGranularConsent(serialized)
      expect(parsed).toEqual(original)
    })

    it('preserves analytics-only through serialize and parse', () => {
      const original: GranularConsent = {
        essential: true,
        analytics: true,
        marketing: false,
        wordingVersion: 2,
      }
      const serialized = serializeGranularConsent(original)
      const parsed = parseGranularConsent(serialized)
      expect(parsed).toEqual(original)
    })
  })
})
