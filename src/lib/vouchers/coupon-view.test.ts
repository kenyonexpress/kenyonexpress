import {
  COUPON_STATUS_LABELS,
  type CouponStatus,
  couponMoneyView,
  couponStatusView,
  formatAgorot,
  formatCouponCode,
  formatCouponDate,
  isCouponLapsedUnswept,
  isCouponPresentable,
} from '@/lib/vouchers/coupon-view'
import { describe, expect, it } from 'vitest'

const NOW = new Date('2026-07-31T10:00:00.000Z')

function voucher(overrides: Partial<{ status: string; expires_at: string }> = {}) {
  return {
    status: 'issued',
    expires_at: '2026-08-30T10:00:00.000Z',
    ...overrides,
  }
}

describe('isCouponPresentable', () => {
  it('accepts an issued voucher before its deadline', () => {
    expect(isCouponPresentable(voucher(), NOW)).toBe(true)
  })

  it('refuses every status other than issued, even in date', () => {
    for (const status of ['redeemed', 'expired', 'cancelled', 'refunded']) {
      expect(isCouponPresentable(voucher({ status }), NOW)).toBe(false)
    }
  })

  it('refuses an issued voucher whose deadline has passed', () => {
    expect(isCouponPresentable(voucher({ expires_at: '2026-07-30T23:59:59Z' }), NOW)).toBe(false)
  })

  it('treats the exact deadline as past, matching redeem_voucher', () => {
    expect(isCouponPresentable(voucher({ expires_at: NOW.toISOString() }), NOW)).toBe(false)
  })

  it('refuses an unparseable deadline rather than assuming it is live', () => {
    expect(isCouponPresentable(voucher({ expires_at: 'not-a-date' }), NOW)).toBe(false)
  })
})

describe('isCouponLapsedUnswept', () => {
  it('is true only for an issued row the clock has passed', () => {
    expect(isCouponLapsedUnswept(voucher({ expires_at: '2026-07-01T00:00:00Z' }), NOW)).toBe(true)
    expect(isCouponLapsedUnswept(voucher(), NOW)).toBe(false)
    expect(
      isCouponLapsedUnswept(
        voucher({ status: 'expired', expires_at: '2026-07-01T00:00:00Z' }),
        NOW,
      ),
    ).toBe(false)
  })
})

describe('couponStatusView', () => {
  it('reports a live voucher with whole days left', () => {
    const view = couponStatusView(voucher({ expires_at: '2026-08-10T10:00:00.000Z' }), NOW)
    expect(view).toMatchObject({
      label: 'פעיל',
      tone: 'live',
      presentable: true,
      daysLeft: 10,
      expiringSoon: false,
    })
  })

  it('floors a partial day rather than rounding it up', () => {
    const view = couponStatusView(voucher({ expires_at: '2026-08-02T09:00:00.000Z' }), NOW)
    expect(view.daysLeft).toBe(1)
  })

  it('reports 0 days left on the final day, still presentable', () => {
    const view = couponStatusView(voucher({ expires_at: '2026-07-31T23:00:00.000Z' }), NOW)
    expect(view.daysLeft).toBe(0)
    expect(view.presentable).toBe(true)
    expect(view.expiringSoon).toBe(true)
  })

  it('flags the last three days as expiring soon', () => {
    expect(
      couponStatusView(voucher({ expires_at: '2026-08-03T09:00:00Z' }), NOW).expiringSoon,
    ).toBe(true)
    expect(
      couponStatusView(voucher({ expires_at: '2026-08-05T09:00:00Z' }), NOW).expiringSoon,
    ).toBe(false)
  })

  // The point of the module: the column says issued, the customer must not be
  // told it is usable, because redeem_voucher() will refuse it.
  it('shows a lapsed-but-unswept voucher as expired, not active', () => {
    const view = couponStatusView(voucher({ expires_at: '2026-07-01T00:00:00Z' }), NOW)
    expect(view.label).toBe('פג תוקף')
    expect(view.tone).toBe('lapsed')
    expect(view.presentable).toBe(false)
    expect(view.daysLeft).toBeNull()
  })

  it('maps each terminal status to its own label and tone', () => {
    const cases: Array<[CouponStatus, string]> = [
      ['redeemed', 'used'],
      ['expired', 'lapsed'],
      ['cancelled', 'void'],
      ['refunded', 'void'],
    ]
    for (const [status, tone] of cases) {
      const view = couponStatusView(voucher({ status }), NOW)
      expect(view.label).toBe(COUPON_STATUS_LABELS[status])
      expect(view.tone).toBe(tone)
      expect(view.presentable).toBe(false)
    }
  })

  it('never presents a voucher whose deadline will not parse', () => {
    const view = couponStatusView(voucher({ expires_at: '' }), NOW)
    expect(view.presentable).toBe(false)
    expect(view.label).toBe('פג תוקף')
  })
})

describe('couponMoneyView', () => {
  it('splits a conserved snapshot into the three displayed numbers', () => {
    const view = couponMoneyView({
      face_value_agorot: 20000,
      coupon_price_agorot: 2000,
      remaining_amount_due_agorot: 18000,
    })
    expect(view).toEqual({
      faceValueAgorot: 20000,
      paidOnlineAgorot: 2000,
      dueAtBusinessAgorot: 18000,
      conserved: true,
    })
  })

  // A display path must not invent a balance: the counter collects what the
  // snapshot says, so a violation is surfaced, not silently repaired.
  it('reports a violation without rewriting the stored balance', () => {
    const view = couponMoneyView({
      face_value_agorot: 20000,
      coupon_price_agorot: 2000,
      remaining_amount_due_agorot: 17000,
    })
    expect(view.conserved).toBe(false)
    expect(view.dueAtBusinessAgorot).toBe(17000)
  })

  it('accepts a fully prepaid voucher as conserved', () => {
    expect(
      couponMoneyView({
        face_value_agorot: 5000,
        coupon_price_agorot: 5000,
        remaining_amount_due_agorot: 0,
      }).conserved,
    ).toBe(true)
  })
})

describe('formatCouponCode', () => {
  it('groups a 10 symbol code as XXXXX-XXXXX', () => {
    expect(formatCouponCode('ABCDEFGHJK')).toBe('ABCDE-FGHJK')
  })

  it('normalises separators and case before grouping', () => {
    expect(formatCouponCode('abcde-fghjk')).toBe('ABCDE-FGHJK')
    expect(formatCouponCode(' abc de fghjk ')).toBe('ABCDE-FGHJK')
  })

  it('leaves a partial code ungrouped', () => {
    expect(formatCouponCode('ABC')).toBe('ABC')
    expect(formatCouponCode('')).toBe('')
  })
})

describe('formatAgorot', () => {
  it('renders agorot as shekels with two decimals', () => {
    expect(formatAgorot(18000)).toBe('₪180.00')
    expect(formatAgorot(0)).toBe('₪0.00')
    expect(formatAgorot(1)).toBe('₪0.01')
  })

  it('renders a missing or non-finite amount as a dash, never as zero', () => {
    expect(formatAgorot(null)).toBe('—')
    expect(formatAgorot(undefined)).toBe('—')
    expect(formatAgorot(Number.NaN)).toBe('—')
  })
})

describe('formatCouponDate', () => {
  it('formats an ISO date in Hebrew', () => {
    expect(formatCouponDate('2026-08-30T10:00:00.000Z')).toContain('2026')
  })

  it('returns a dash for a missing or invalid date', () => {
    expect(formatCouponDate(null)).toBe('—')
    expect(formatCouponDate('nonsense')).toBe('—')
  })
})
