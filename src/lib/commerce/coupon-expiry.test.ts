import { describe, expect, it } from 'vitest'
import { describeCouponExpiry } from './coupon-expiry'

const NOW = new Date('2026-09-16T10:00:00Z')
const at = (iso: string) => new Date(iso)

describe('describeCouponExpiry', () => {
  it('says nothing when neither clock is set', () => {
    expect(describeCouponExpiry({ validUntil: null, expiryDays: null, now: NOW })).toEqual({
      daysLeft: null,
      deadlineLabel: null,
      countdownLabel: null,
      urgency: 'none',
      voucherLabel: null,
    })
  })

  it('counts whole days to the offer deadline and names the date', () => {
    const r = describeCouponExpiry({
      validUntil: at('2026-09-26T10:00:00Z'),
      expiryDays: null,
      now: NOW,
    })
    expect(r.daysLeft).toBe(10)
    expect(r.deadlineLabel).toMatch(/^בתוקף עד /)
    expect(r.deadlineLabel).toContain('2026')
    expect(r.countdownLabel).toBe('נותרו 10 ימים למבצע')
    expect(r.urgency).toBe('none')
  })

  it('turns urgent inside a week, and singular on the last full day', () => {
    expect(
      describeCouponExpiry({ validUntil: at('2026-09-20T10:00:00Z'), expiryDays: null, now: NOW }),
    ).toMatchObject({ daysLeft: 4, countdownLabel: 'נותרו 4 ימים למבצע', urgency: 'soon' })
    expect(
      describeCouponExpiry({ validUntil: at('2026-09-17T12:00:00Z'), expiryDays: null, now: NOW }),
    ).toMatchObject({ daysLeft: 1, countdownLabel: 'נותר יום אחד למבצע', urgency: 'soon' })
  })

  it('calls the final hours the last day, and a passed deadline ended', () => {
    expect(
      describeCouponExpiry({ validUntil: at('2026-09-16T20:00:00Z'), expiryDays: null, now: NOW }),
    ).toMatchObject({ daysLeft: 0, countdownLabel: 'היום האחרון למבצע', urgency: 'today' })
    expect(
      describeCouponExpiry({ validUntil: at('2026-09-15T20:00:00Z'), expiryDays: null, now: NOW }),
    ).toMatchObject({ daysLeft: 0, countdownLabel: 'המבצע הסתיים', urgency: 'today' })
  })

  it('describes the voucher life from the purchase, not from today', () => {
    expect(describeCouponExpiry({ validUntil: null, expiryDays: 30, now: NOW }).voucherLabel).toBe(
      'השובר תקף 30 ימים מרגע הרכישה',
    )
    expect(describeCouponExpiry({ validUntil: null, expiryDays: 1, now: NOW }).voucherLabel).toBe(
      'השובר תקף יום אחד מרגע הרכישה',
    )
    expect(
      describeCouponExpiry({ validUntil: null, expiryDays: 0, now: NOW }).voucherLabel,
    ).toBeNull()
    expect(
      describeCouponExpiry({ validUntil: null, expiryDays: -3, now: NOW }).voucherLabel,
    ).toBeNull()
  })

  it('ignores an unparseable deadline instead of printing NaN', () => {
    const r = describeCouponExpiry({ validUntil: new Date('nope'), expiryDays: null, now: NOW })
    expect(r.daysLeft).toBeNull()
    expect(r.deadlineLabel).toBeNull()
  })
})
