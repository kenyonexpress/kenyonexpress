import { describe, expect, it } from 'vitest'
import { FLAGS, flagReport, isFlagOn } from './index'

describe('flags integration', () => {
  describe('env-only mode (sync)', () => {
    it('reads flags from env vars', () => {
      const env = {
        FLAG_PHYSICAL_PRODUCTS: '1',
        FLAG_COURSES_MONTHLY: 'true',
        FLAG_TZIMMER_CALENDAR: '0',
        FLAG_MONTHLY_BILLING: '',
      }

      expect(isFlagOn('physical-products', env)).toBe(true)
      expect(isFlagOn('courses-monthly', env)).toBe(true)
      expect(isFlagOn('tzimmer-calendar', env)).toBe(false)
      expect(isFlagOn('monthly-billing', env)).toBe(false)
    })

    it('returns false for missing env vars', () => {
      const env = {}
      expect(isFlagOn('physical-products', env)).toBe(false)
      expect(isFlagOn('courses-monthly', env)).toBe(false)
    })

    it('only accepts exact "1" or "true" as truthy', () => {
      const cases = [
        { value: '1', expected: true },
        { value: 'true', expected: true },
        { value: 'TRUE', expected: true },
        { value: 'True', expected: true },
        { value: '0', expected: false },
        { value: 'false', expected: false },
        { value: 'yes', expected: false },
        { value: 'on', expected: false },
        { value: '', expected: false },
        { value: 'random', expected: false },
      ]

      for (const { value, expected } of cases) {
        const env = { FLAG_PHYSICAL_PRODUCTS: value }
        expect(isFlagOn('physical-products', env)).toBe(expected)
      }
    })

    it('produces a complete report', () => {
      const env = {
        FLAG_PHYSICAL_PRODUCTS: '1',
        FLAG_MAINTENANCE_BANNER: 'true',
      }

      const report = flagReport(env)

      expect(report).toEqual({
        'physical-products': true,
        'courses-monthly': false,
        'tzimmer-calendar': false,
        'monthly-billing': false,
        payment_production: false,
        'maintenance-banner': true,
        wa_otp_enabled: false,
      })
    })
  })

  describe('FLAGS constant', () => {
    it('maps flag names to env var names', () => {
      expect(FLAGS['physical-products']).toBe('FLAG_PHYSICAL_PRODUCTS')
      expect(FLAGS['courses-monthly']).toBe('FLAG_COURSES_MONTHLY')
      expect(FLAGS['tzimmer-calendar']).toBe('FLAG_TZIMMER_CALENDAR')
      expect(FLAGS['monthly-billing']).toBe('FLAG_MONTHLY_BILLING')
      expect(FLAGS['maintenance-banner']).toBe('FLAG_MAINTENANCE_BANNER')
    })

    it('has exactly 7 flags', () => {
      expect(Object.keys(FLAGS)).toHaveLength(7)
    })
  })
})
