import { describe, expect, it } from 'vitest'
import { checkIsraeliPostalCode, checkOptionalIsraeliPostalCode } from './israeli-postal-code'

describe('checkIsraeliPostalCode', () => {
  it('accepts the 7-digit modern code', () => {
    const result = checkIsraeliPostalCode('7570806')
    expect(result).toEqual({ ok: true, normalized: '7570806', form: 'modern-7' })
  })

  it('accepts the 5-digit legacy code rather than padding it', () => {
    // Padding would invent two digits, and those two digits are the delivery
    // area. Reporting the form back lets the caller decide; it must not guess.
    const result = checkIsraeliPostalCode('75708')
    expect(result).toEqual({ ok: true, normalized: '75708', form: 'legacy-5' })
  })

  it('keeps leading zeros, which are part of the code', () => {
    const result = checkIsraeliPostalCode('0123456')
    expect(result.ok && result.normalized).toBe('0123456')
  })

  it.each([
    ['757 0806', '7570806'],
    ['7570-806', '7570806'],
    ['‎7570806‏', '7570806'],
  ])('strips the separators people actually type: %s', (input, expected) => {
    const result = checkIsraeliPostalCode(input)
    expect(result.ok && result.normalized).toBe(expected)
  })

  it.each([
    ['', 'empty'],
    ['   ', 'empty'],
    ['12a4567', 'non-digit'],
    ['123456', 'length'],
    ['12345678', 'length'],
    ['1234', 'length'],
    ['0000000', 'all-zero'],
    ['00000', 'all-zero'],
  ])('rejects %s as %s', (input, reason) => {
    const result = checkIsraeliPostalCode(input)
    expect(result.ok).toBe(false)
    expect(!result.ok && result.reason).toBe(reason)
  })

  it('rejects non-strings without throwing', () => {
    for (const value of [null, undefined, 7570806, {}, []]) {
      expect(checkIsraeliPostalCode(value).ok).toBe(false)
    }
  })

  it('carries a Hebrew message on every failure', () => {
    for (const value of ['', '12a4567', '123456', '0000000']) {
      const result = checkIsraeliPostalCode(value)
      expect(!result.ok && result.message.length).toBeGreaterThan(0)
      expect(!result.ok && /[֐-׿]/.test(result.message)).toBe(true)
    }
  })
})

describe('checkOptionalIsraeliPostalCode', () => {
  it('returns null for an omitted code, since the field is optional', () => {
    expect(checkOptionalIsraeliPostalCode('')).toBeNull()
    expect(checkOptionalIsraeliPostalCode('  ')).toBeNull()
    expect(checkOptionalIsraeliPostalCode(null)).toBeNull()
  })

  it('still rejects a present but wrong code', () => {
    // Optional means may be omitted, not may be wrong. A 6-digit code posted
    // through would reach Israel Post as an address nobody can deliver to.
    const result = checkOptionalIsraeliPostalCode('123456')
    expect(result?.ok).toBe(false)
  })

  it('accepts a present and correct code', () => {
    expect(checkOptionalIsraeliPostalCode('7570806')?.ok).toBe(true)
  })
})
