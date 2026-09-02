import { describe, expect, it } from 'vitest'
import {
  COUPON_QR_PREFIX,
  buildCouponQrPayload,
  couponCheckDigit,
  generateCoupon,
  generateCouponCode,
  isValidCouponCode,
  parseCouponQrPayload,
} from './generator'

/** Deterministic "random" that replays a fixed digit sequence. */
function replay(digits: number[]): (max: number) => number {
  let i = 0
  return () => digits[i++ % digits.length] as number
}

describe('generateCouponCode', () => {
  it('produces exactly 8 numeric digits', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateCouponCode()).toMatch(/^\d{8}$/)
    }
  })

  it('always self-validates', () => {
    for (let i = 0; i < 200; i++) {
      expect(isValidCouponCode(generateCouponCode())).toBe(true)
    }
  })

  it('keeps leading zeros', () => {
    const code = generateCouponCode(replay([0, 0, 0, 0, 0, 0, 0]))
    expect(code).toBe('00000000')
    expect(isValidCouponCode(code)).toBe(true)
  })

  it('is deterministic under an injected RNG', () => {
    const a = generateCouponCode(replay([5, 7, 2, 4, 3, 9, 4]))
    const b = generateCouponCode(replay([5, 7, 2, 4, 3, 9, 4]))
    expect(a).toBe(b)
    expect(a).toBe(`5724394${couponCheckDigit('5724394')}`)
  })

  it('rejects an RNG that steps outside [0, 10)', () => {
    expect(() => generateCouponCode(() => 10)).toThrow(/expected an integer/)
    expect(() => generateCouponCode(() => -1)).toThrow(/expected an integer/)
    expect(() => generateCouponCode(() => 3.5)).toThrow(/expected an integer/)
  })
})

describe('checksum (Damm)', () => {
  it('known value: check digit of 572 is 4 and 5724 validates', () => {
    // The canonical worked example for this operation table.
    expect(couponCheckDigit('572')).toBe(4)
  })

  it('rejects every single-digit mutation of a valid code', () => {
    const code = generateCouponCode(replay([8, 1, 6, 0, 9, 2, 7]))
    for (let pos = 0; pos < code.length; pos++) {
      for (let d = 0; d <= 9; d++) {
        const mutated = code.slice(0, pos) + String(d) + code.slice(pos + 1)
        if (mutated === code) continue
        expect(isValidCouponCode(mutated)).toBe(false)
      }
    }
  })

  it('rejects every adjacent transposition that changes a valid code', () => {
    const code = generateCouponCode(replay([3, 8, 1, 5, 9, 0, 6]))
    for (let pos = 0; pos < code.length - 1; pos++) {
      if (code[pos] === code[pos + 1]) continue
      const swapped =
        code.slice(0, pos) + (code[pos + 1] as string) + (code[pos] as string) + code.slice(pos + 2)
      expect(isValidCouponCode(swapped)).toBe(false)
    }
  })

  it('rejects wrong lengths and non-digits', () => {
    expect(isValidCouponCode('')).toBe(false)
    expect(isValidCouponCode('1234567')).toBe(false)
    expect(isValidCouponCode('123456789')).toBe(false)
    expect(isValidCouponCode('1234567a')).toBe(false)
    expect(isValidCouponCode('1234 567')).toBe(false)
  })

  it('couponCheckDigit refuses non-digit input', () => {
    expect(() => couponCheckDigit('')).toThrow()
    expect(() => couponCheckDigit('12a4')).toThrow()
  })
})

describe('QR payload', () => {
  it('wraps the code in the KEC1. prefix', () => {
    const code = generateCouponCode()
    expect(buildCouponQrPayload(code)).toBe(`${COUPON_QR_PREFIX}${code}`)
  })

  it('refuses to build a payload for an invalid code', () => {
    expect(() => buildCouponQrPayload('12345678'.replace(/./, '9'))).toThrow()
    expect(() => buildCouponQrPayload('abc')).toThrow()
  })

  it('round-trips through parseCouponQrPayload', () => {
    const { code, qrPayload } = generateCoupon()
    expect(parseCouponQrPayload(qrPayload)).toBe(code)
    expect(parseCouponQrPayload(` ${qrPayload} `)).toBe(code)
  })

  it('rejects foreign or damaged payloads', () => {
    expect(parseCouponQrPayload('')).toBeNull()
    expect(parseCouponQrPayload('KEV1.something.mac')).toBeNull()
    expect(parseCouponQrPayload('KEC1.')).toBeNull()
    expect(parseCouponQrPayload('KEC1.1234567')).toBeNull()
    const { code } = generateCoupon()
    const flipped = String((Number(code[7]) + 1) % 10)
    expect(parseCouponQrPayload(`KEC1.${code.slice(0, 7)}${flipped}`)).toBeNull()
  })
})

describe('generateCoupon', () => {
  it('returns a matching code and payload', () => {
    const { code, qrPayload } = generateCoupon(replay([1, 2, 3, 4, 5, 6, 7]))
    expect(qrPayload).toBe(COUPON_QR_PREFIX + code)
    expect(isValidCouponCode(code)).toBe(true)
  })

  it('spreads over the space: 500 draws collide rarely', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 500; i++) seen.add(generateCouponCode())
    // 500 draws from 10^7 bodies; more than a couple of collisions means a broken RNG hookup.
    expect(seen.size).toBeGreaterThan(495)
  })
})
