import { describe, expect, it } from 'vitest'
import { FLAGS, FLAG_NAMES, flagReport, isFlagOn } from './index'

describe('phase 2 flags', () => {
  it('are all OFF with an empty environment', () => {
    expect(Object.values(flagReport({})).every((v) => v === false)).toBe(true)
  })

  it('covers the four phase 2 flags and the banner', () => {
    expect(FLAG_NAMES.sort()).toEqual(
      [
        'courses-monthly',
        'maintenance-banner',
        'monthly-billing',
        'payment_production',
        'physical-products',
        'tzimmer-calendar',
        'wa_otp_enabled',
        'card_verify_enabled',
      ].sort(),
    )
  })

  it('turns on only for 1 or true', () => {
    const env = (v: string) => ({ [FLAGS['monthly-billing']]: v })
    expect(isFlagOn('monthly-billing', env('1'))).toBe(true)
    expect(isFlagOn('monthly-billing', env(' TRUE '))).toBe(true)
    for (const v of ['', '0', 'false', 'yes', 'on']) {
      expect(isFlagOn('monthly-billing', env(v))).toBe(false)
    }
  })

  it('uses ASCII env names', () => {
    for (const n of Object.values(FLAGS)) expect(n).toMatch(/^[A-Z0-9_]+$/)
  })
})

describe('payment_production', () => {
  it('is OFF unless FLAG_PAYMENT_PRODUCTION is 1 or true', () => {
    expect(isFlagOn('payment_production', {})).toBe(false)
    expect(isFlagOn('payment_production', { FLAG_PAYMENT_PRODUCTION: 'false' })).toBe(false)
    expect(isFlagOn('payment_production', { FLAG_PAYMENT_PRODUCTION: '1' })).toBe(true)
  })
})
