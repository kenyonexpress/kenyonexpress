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
        'physical-products',
        'tzimmer-calendar',
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
