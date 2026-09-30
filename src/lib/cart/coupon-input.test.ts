import { checkCouponInput, isNumericCouponCode } from '@/lib/cart/coupon-input'
import { generateUnitCode, luhnCheckDigit } from '@/lib/coupons/unit-codes'
import { describe, expect, it } from 'vitest'

/**
 * The field's local gate. What it holds:
 *
 *  - a digit-only code is a unit code and must be exactly 8 digits with a
 *    good Luhn check digit; each failure names itself;
 *  - a code with a letter in it is never judged here, only normalised;
 *  - the empty and over-long cases match the server's own refusals.
 */

const body = '1234567'
const valid = body + String(luhnCheckDigit(body))
const wrongCheck = body + String((luhnCheckDigit(body) + 1) % 10)

describe('checkCouponInput', () => {
  it('accepts a well-formed 8-digit unit code', () => {
    expect(checkCouponInput(valid)).toEqual({ ok: true, code: valid })
  })

  it('accepts a generated unit code, spaces and all', () => {
    const code = generateUnitCode(() => 7)
    const spaced = `${code.slice(0, 4)} ${code.slice(4)}`
    expect(checkCouponInput(spaced)).toEqual({ ok: true, code })
  })

  it('refuses 7 digits and 9 digits by length, not by check digit', () => {
    expect(checkCouponInput('1234567')).toMatchObject({ ok: false, reason: 'digits-not-eight' })
    expect(checkCouponInput(`${valid}0`)).toMatchObject({ ok: false, reason: 'digits-not-eight' })
  })

  it('refuses 8 digits whose check digit disagrees with the other seven', () => {
    const result = checkCouponInput(wrongCheck)
    expect(result).toMatchObject({ ok: false, reason: 'check-digit' })
    if (!result.ok) expect(result.message).toContain('הספרות')
  })

  it('leaves a campaign word alone apart from normalising it', () => {
    expect(checkCouponInput(' summer 10 ')).toEqual({ ok: true, code: 'SUMMER10' })
    // Seven characters with a letter: not a unit code, not judged as one.
    expect(checkCouponInput('A234567')).toEqual({ ok: true, code: 'A234567' })
  })

  it('refuses the empty field and an over-long code', () => {
    expect(checkCouponInput('   ')).toMatchObject({ ok: false, reason: 'empty' })
    expect(checkCouponInput('X'.repeat(65))).toMatchObject({ ok: false, reason: 'too-long' })
    expect(checkCouponInput('X'.repeat(64)).ok).toBe(true)
  })

  it('every refusal carries a Hebrew message', () => {
    for (const raw of ['', '123', wrongCheck, 'Y'.repeat(70)]) {
      const result = checkCouponInput(raw)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.message).toMatch(/[֐-׿]/)
    }
  })
})

describe('isNumericCouponCode', () => {
  it('is digits only', () => {
    expect(isNumericCouponCode('12345678')).toBe(true)
    expect(isNumericCouponCode('1234567A')).toBe(false)
    expect(isNumericCouponCode('')).toBe(false)
  })
})
