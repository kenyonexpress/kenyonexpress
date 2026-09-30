import { describe, expect, it } from 'vitest'
import { base32Decode, hotpCode, msUntilNextStep, totpCode } from './totp.mjs'

/**
 * The RFC 4226 (appendix D) and RFC 6238 (appendix B, SHA-1 column) test
 * vectors. If these hold, the code the seed script mints is the code
 * GoTrue expects, and the code the Playwright login types is too.
 */

// "12345678901234567890" in ASCII, the RFC key, as base32.
const RFC_SECRET_BASE32 = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'

describe('base32Decode', () => {
  it('decodes the RFC key', () => {
    expect(base32Decode(RFC_SECRET_BASE32).toString('ascii')).toBe('12345678901234567890')
  })

  it('is case-insensitive and ignores padding and separators', () => {
    expect(base32Decode('gezd gnbv-gy3tqojqgezdgnbvgy3tqojq==').toString('ascii')).toBe(
      '12345678901234567890',
    )
  })

  it('refuses a character outside the alphabet', () => {
    expect(() => base32Decode('GEZD1')).toThrow(/invalid base32/)
    expect(() => base32Decode('')).toThrow(/empty/)
  })
})

describe('hotpCode (RFC 4226 appendix D)', () => {
  it.each([
    [0, '755224'],
    [1, '287082'],
    [2, '359152'],
    [3, '969429'],
    [7, '162583'],
    [9, '520489'],
  ])('counter %i is %s', (counter, expected) => {
    expect(hotpCode(RFC_SECRET_BASE32, counter)).toBe(expected)
  })
})

describe('totpCode (RFC 6238 appendix B, SHA-1)', () => {
  it.each([
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
    [20000000000, '65353130'],
  ])('at T=%i the 8-digit code is %s', (seconds, expected) => {
    expect(totpCode(RFC_SECRET_BASE32, seconds * 1000, { digits: 8 })).toBe(expected)
    expect(totpCode(RFC_SECRET_BASE32, seconds * 1000)).toBe(expected.slice(-6))
  })

  it('is the same code anywhere inside one 30-second step', () => {
    expect(totpCode(RFC_SECRET_BASE32, 30_000)).toBe(totpCode(RFC_SECRET_BASE32, 59_999))
    expect(totpCode(RFC_SECRET_BASE32, 59_999)).not.toBe(totpCode(RFC_SECRET_BASE32, 60_000))
  })
})

describe('msUntilNextStep', () => {
  it('counts down to the step boundary', () => {
    expect(msUntilNextStep(0)).toBe(30_000)
    expect(msUntilNextStep(29_000)).toBe(1_000)
    expect(msUntilNextStep(30_000)).toBe(30_000)
  })
})
