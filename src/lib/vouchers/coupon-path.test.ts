import { describe, expect, it } from 'vitest'
import { couponPathNeedsSession, couponPathSegment, isVoucherId } from './coupon-path'

const ID = '2f1c9a3e-7b4d-4c0e-9a8f-1d2e3f4a5b6c'

describe('isVoucherId', () => {
  it('accepts a UUID in either case', () => {
    expect(isVoucherId(ID)).toBe(true)
    expect(isVoucherId(ID.toUpperCase())).toBe(true)
  })

  it('refuses product slugs, including hyphenated Hebrew and ASCII ones', () => {
    expect(isVoucherId('ארוחת-שף-זוגית')).toBe(false)
    expect(isVoucherId('spa-day-eilat')).toBe(false)
    expect(isVoucherId('a-b-c-d-e')).toBe(false)
    expect(isVoucherId('')).toBe(false)
  })

  it('refuses a UUID with anything around it', () => {
    expect(isVoucherId(`${ID}/`)).toBe(false)
    expect(isVoucherId(` ${ID}`)).toBe(false)
  })
})

describe('couponPathSegment', () => {
  it('returns the decoded first segment under /coupon/', () => {
    expect(couponPathSegment(`/coupon/${ID}`)).toBe(ID)
    expect(couponPathSegment('/coupon/%D7%A7%D7%95%D7%A4%D7%95%D7%9F')).toBe('קופון')
    expect(couponPathSegment('/coupon/spa-day/extra')).toBe('spa-day')
  })

  it('returns null off the prefix and for the bare prefix', () => {
    expect(couponPathSegment('/coupons/abc')).toBeNull()
    expect(couponPathSegment('/coupon/')).toBeNull()
    expect(couponPathSegment('/product/abc')).toBeNull()
  })

  it('survives a malformed percent sequence', () => {
    expect(couponPathSegment('/coupon/%E0%A4%A')).toBe('%E0%A4%A')
  })
})

describe('couponPathNeedsSession', () => {
  it('gates the voucher half only', () => {
    expect(couponPathNeedsSession(`/coupon/${ID}`)).toBe(true)
    expect(couponPathNeedsSession('/coupon/spa-day-eilat')).toBe(false)
    expect(couponPathNeedsSession('/coupon/%D7%A7%D7%95%D7%A4%D7%95%D7%9F')).toBe(false)
  })

  it('leaves every other path alone', () => {
    expect(couponPathNeedsSession('/coupons/abc')).toBe(false)
    expect(couponPathNeedsSession('/account/coupons')).toBe(false)
    expect(couponPathNeedsSession('/coupon/')).toBe(false)
  })
})
