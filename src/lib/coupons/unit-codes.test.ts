import { describe, expect, it } from 'vitest'
import {
  buildCouponApplyUrl,
  generateUnitCode,
  generateUnitCodes,
  isUnitCodeShaped,
  isValidUnitCode,
  luhnCheckDigit,
} from './unit-codes'

describe('luhnCheckDigit', () => {
  it('matches hand-computed values', () => {
    // 7992739871 is the classic Luhn worked example: check digit 3.
    expect(luhnCheckDigit('7992739871')).toBe(3)
    // All zeros already sum to a multiple of 10.
    expect(luhnCheckDigit('0000000')).toBe(0)
  })

  it('rejects non-digit input instead of silently mis-checking', () => {
    expect(() => luhnCheckDigit('12a4567')).toThrow()
  })

  it('every generated code round-trips through the validator', () => {
    for (let i = 0; i < 200; i++) {
      expect(isValidUnitCode(generateUnitCode())).toBe(true)
    }
  })
})

describe('isValidUnitCode', () => {
  it('rejects wrong shapes', () => {
    expect(isUnitCodeShaped('1234567')).toBe(false)
    expect(isUnitCodeShaped('123456789')).toBe(false)
    expect(isUnitCodeShaped('1234567a')).toBe(false)
    expect(isValidUnitCode('SUMMER20')).toBe(false)
    expect(isValidUnitCode('')).toBe(false)
  })

  it('rejects a single-digit typo', () => {
    const code = generateUnitCode()
    const flipped = (Number(code[0]) + 1) % 10
    expect(isValidUnitCode(`${flipped}${code.slice(1)}`)).toBe(false)
  })

  it('accepts exactly one check digit per body', () => {
    const body = '1234567'
    const check = luhnCheckDigit(body)
    for (let d = 0; d <= 9; d++) {
      expect(isValidUnitCode(`${body}${d}`)).toBe(d === check)
    }
  })
})

describe('generateUnitCodes', () => {
  it('returns the requested number of distinct codes', () => {
    const codes = generateUnitCodes(500)
    expect(codes).toHaveLength(500)
    expect(new Set(codes).size).toBe(500)
    for (const code of codes) expect(isValidUnitCode(code)).toBe(true)
  })

  it('never returns an excluded code', () => {
    // A deterministic RNG whose FIRST candidate is the excluded code, so the
    // retry path actually runs: all-ones once, then all-twos.
    let n = 0
    const randomDigit = () => (++n <= 7 ? 1 : 2)
    const excluded = generateUnitCode(() => 1)
    const codes = generateUnitCodes(1, { exclude: new Set([excluded]), randomDigit })
    expect(codes[0]).not.toBe(excluded)
    expect(codes[0]).toBe(generateUnitCode(() => 2))
  })

  it('throws instead of spinning when the space is exhausted', () => {
    // A constant RNG yields one possible code, so a request for two must fail.
    expect(() => generateUnitCodes(2, { randomDigit: () => 5 })).toThrow()
  })

  it('rejects a non-positive count', () => {
    expect(() => generateUnitCodes(0)).toThrow()
    expect(() => generateUnitCodes(1.5)).toThrow()
  })
})

describe('buildCouponApplyUrl', () => {
  it('joins origin and code', () => {
    expect(buildCouponApplyUrl('https://kenyonexpress.co.il', '12345678')).toBe(
      'https://kenyonexpress.co.il/c/12345678',
    )
  })

  it('survives a trailing slash on the origin', () => {
    expect(buildCouponApplyUrl('https://kenyonexpress.co.il/', '12345678')).toBe(
      'https://kenyonexpress.co.il/c/12345678',
    )
  })
})
