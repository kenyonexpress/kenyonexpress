import {
  type CouponCodeStat,
  type OrderStat,
  behaviouralFunnel,
  bucketSignups,
  cashbackOutstanding,
  couponRedemption,
  effectiveCouponStatus,
  growthTotals,
  orderDropoff,
  pctOf,
} from '@/lib/analytics/dashboard-kpis'
import { describe, expect, it } from 'vitest'

const NOW = new Date('2026-03-15T12:00:00.000Z')

function code(overrides: Partial<CouponCodeStat> = {}): CouponCodeStat {
  return {
    status: 'issued',
    createdAt: '2026-03-01T10:00:00.000Z',
    redeemedAt: null,
    expiresAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('pctOf', () => {
  it('rounds to one decimal', () => {
    expect(pctOf(1, 3)).toBe(33.3)
  })

  it('is null, not 0 or NaN, when there is no whole', () => {
    expect(pctOf(0, 0)).toBeNull()
    expect(pctOf(5, -1)).toBeNull()
  })
})

describe('couponRedemption', () => {
  it('treats an issued code past its expiry as expired without waiting for the sweeper', () => {
    expect(effectiveCouponStatus(code({ expiresAt: '2026-03-14T00:00:00.000Z' }), NOW)).toBe(
      'expired',
    )
    expect(effectiveCouponStatus(code(), NOW)).toBe('issued')
    expect(effectiveCouponStatus(code({ status: 'used' }), NOW)).toBe('used')
  })

  it('rates redemption over decided codes only and excludes refunds', () => {
    const result = couponRedemption(
      [
        code({ status: 'used', redeemedAt: '2026-03-03T10:00:00.000Z' }),
        code({ status: 'used', redeemedAt: '2026-03-05T10:00:00.000Z' }),
        code({ status: 'used', redeemedAt: '2026-03-11T10:00:00.000Z' }),
        code({ status: 'expired' }),
        code({ status: 'issued', expiresAt: '2026-03-10T00:00:00.000Z' }),
        code(),
        code(),
        code({ status: 'refunded' }),
      ],
      NOW,
    )

    expect(result).toMatchObject({
      total: 8,
      open: 2,
      used: 3,
      expired: 2,
      refunded: 1,
    })
    // 3 used of 5 decided.
    expect(result.redemptionRatePct).toBe(60)
    // 3 used of 7 not refunded.
    expect(result.usedOfIssuedPct).toBe(42.9)
    expect(result.breakagePct).toBe(40)
    // 2, 4 and 10 days: the median is the middle one.
    expect(result.medianDaysToRedeem).toBe(4)
  })

  it('reports null rates on an empty window instead of 0%', () => {
    const result = couponRedemption([], NOW)
    expect(result.total).toBe(0)
    expect(result.redemptionRatePct).toBeNull()
    expect(result.usedOfIssuedPct).toBeNull()
    expect(result.breakagePct).toBeNull()
    expect(result.medianDaysToRedeem).toBeNull()
  })

  it('averages the two middle values for an even count and ignores a used code without a stamp', () => {
    const result = couponRedemption(
      [
        code({ status: 'used', redeemedAt: '2026-03-02T10:00:00.000Z' }),
        code({ status: 'used', redeemedAt: '2026-03-04T10:00:00.000Z' }),
        code({ status: 'used', redeemedAt: null }),
      ],
      NOW,
    )
    expect(result.used).toBe(3)
    expect(result.medianDaysToRedeem).toBe(2)
  })
})

describe('cashbackOutstanding', () => {
  it('sums only positive balances and flags negative wallets separately', () => {
    const result = cashbackOutstanding([
      { balanceAgorot: 1500, lifetimeEarnedAgorot: 2500, lifetimeRedeemedAgorot: 1000 },
      { balanceAgorot: 0, lifetimeEarnedAgorot: 500, lifetimeRedeemedAgorot: 500 },
      { balanceAgorot: 250, lifetimeEarnedAgorot: 250, lifetimeRedeemedAgorot: 0 },
      { balanceAgorot: -100, lifetimeEarnedAgorot: 0, lifetimeRedeemedAgorot: 100 },
    ])

    expect(result).toEqual({
      outstandingAgorot: 1750,
      walletsWithBalance: 2,
      wallets: 4,
      lifetimeEarnedAgorot: 3250,
      lifetimeRedeemedAgorot: 1600,
      redeemedSharePct: 49.2,
      averageBalanceAgorot: 875,
      negativeWallets: 1,
    })
  })

  it('keeps the average an integer number of agorot', () => {
    const result = cashbackOutstanding([
      { balanceAgorot: 100, lifetimeEarnedAgorot: 100, lifetimeRedeemedAgorot: 0 },
      { balanceAgorot: 101, lifetimeEarnedAgorot: 101, lifetimeRedeemedAgorot: 0 },
      { balanceAgorot: 101, lifetimeEarnedAgorot: 101, lifetimeRedeemedAgorot: 0 },
    ])
    expect(result.averageBalanceAgorot).toBe(101)
    expect(Number.isInteger(result.averageBalanceAgorot)).toBe(true)
  })

  it('refuses a float: money on this path is integer agorot', () => {
    expect(() =>
      cashbackOutstanding([
        { balanceAgorot: 12.5, lifetimeEarnedAgorot: 0, lifetimeRedeemedAgorot: 0 },
      ]),
    ).toThrow(/integer agorot/)
  })

  it('is all zeros and a null share with no wallets', () => {
    const result = cashbackOutstanding([])
    expect(result.outstandingAgorot).toBe(0)
    expect(result.redeemedSharePct).toBeNull()
    expect(result.averageBalanceAgorot).toBe(0)
  })
})

describe('bucketSignups', () => {
  const signups = [
    '2026-03-01T10:00:00.000Z',
    '2026-03-01T22:30:00.000Z', // 00:30 on 03-02 in Israel
    '2026-03-02T08:00:00.000Z',
    '2026-03-09T08:00:00.000Z',
  ]

  it('buckets by Israeli day and carries the running total from the prior count', () => {
    expect(bucketSignups(signups, 'day', 100)).toEqual([
      { key: '2026-03-01', newUsers: 1, cumulativeUsers: 101 },
      { key: '2026-03-02', newUsers: 2, cumulativeUsers: 103 },
      { key: '2026-03-09', newUsers: 1, cumulativeUsers: 104 },
    ])
  })

  it('buckets by Sunday-start week', () => {
    // 2026-03-01 is a Sunday; 03-09 is the Monday of the following week.
    expect(bucketSignups(signups, 'week')).toEqual([
      { key: '2026-03-01', newUsers: 3, cumulativeUsers: 3 },
      { key: '2026-03-08', newUsers: 1, cumulativeUsers: 4 },
    ])
  })

  it('returns no buckets for no sign-ups', () => {
    expect(bucketSignups([], 'month', 40)).toEqual([])
  })
})

describe('growthTotals', () => {
  it('reports the window total, the new grand total and growth over the prior base', () => {
    const buckets = bucketSignups(
      ['2026-03-01T10:00:00.000Z', '2026-03-02T10:00:00.000Z', '2026-03-03T10:00:00.000Z'],
      'day',
      200,
    )
    expect(growthTotals(buckets, 200)).toEqual({
      newUsers: 3,
      totalUsers: 203,
      growthPct: 1.5,
    })
  })

  it('has no growth percent when there was nobody before', () => {
    expect(growthTotals([], 0).growthPct).toBeNull()
  })
})

describe('orderDropoff', () => {
  function order(overrides: Partial<OrderStat> = {}): OrderStat {
    return { status: 'paid', paidAt: '2026-03-10T10:00:00.000Z', expiresAt: null, ...overrides }
  }

  it('counts paid by paid_at so refunded and fulfilled orders stay in the paid step', () => {
    const result = orderDropoff(
      [
        order({ status: 'fulfilled' }),
        order({ status: 'platform_settled' }),
        order({ status: 'partially_fulfilled' }),
        order({ status: 'refunded' }),
        order({ status: 'paid' }),
        order({ status: 'cancelled', paidAt: null }),
        order({ status: 'pending', paidAt: null, expiresAt: '2026-03-14T00:00:00.000Z' }),
        order({ status: 'pending', paidAt: null, expiresAt: '2026-03-16T00:00:00.000Z' }),
        order({ status: 'pending', paidAt: null, expiresAt: null }),
      ],
      NOW,
    )

    expect(result.steps.map((s) => [s.key, s.value, s.fromPreviousPct, s.fromTopPct])).toEqual([
      ['created', 9, null, null],
      ['paid', 5, 55.6, 55.6],
      ['fulfilled', 3, 60, 33.3],
    ])
    expect(result.losses.map((l) => [l.key, l.value, l.ofCreatedPct])).toEqual([
      ['expired_unpaid', 1, 11.1],
      ['cancelled', 1, 11.1],
      ['refunded', 1, 11.1],
    ])
    // One pending with a future expiry and one with no clock at all.
    expect(result.stillOpen).toBe(2)
    // 9 created, 5 paid: the cancelled one and the three pending never paid.
    expect(result.unpaid).toBe(4)
  })

  it('gives null rates and zero counts on an empty window', () => {
    const result = orderDropoff([], NOW)
    expect(result.steps.map((s) => s.value)).toEqual([0, 0, 0])
    expect(result.steps[1]?.fromPreviousPct).toBeNull()
    expect(result.losses.every((l) => l.ofCreatedPct === null)).toBe(true)
  })
})

describe('behaviouralFunnel', () => {
  it('counts distinct sessions per step and takes purchases from the caller', () => {
    const result = behaviouralFunnel(
      [
        { sessionId: 'a', eventName: 'page_view', step: null },
        { sessionId: 'a', eventName: 'view_product', step: null },
        { sessionId: 'a', eventName: 'view_product', step: null },
        { sessionId: 'a', eventName: 'add_to_cart', step: null },
        { sessionId: 'a', eventName: 'checkout_step', step: 'identity' },
        { sessionId: 'a', eventName: 'checkout_step', step: 'payment_redirect' },
        { sessionId: 'b', eventName: 'view_product', step: null },
        { sessionId: 'b', eventName: 'add_to_cart', step: null },
        { sessionId: 'c', eventName: 'page_view', step: null },
        { sessionId: 'd', eventName: 'checkout_step', step: 'address' },
      ],
      1,
    )

    expect(result).toEqual({
      sessions: 4,
      productViews: 2,
      addToCarts: 2,
      checkoutSteps: 2,
      checkouts: 1,
      purchases: 1,
    })
  })

  it('is all zeros with no events', () => {
    expect(behaviouralFunnel([], 0)).toEqual({
      sessions: 0,
      productViews: 0,
      addToCarts: 0,
      checkoutSteps: 0,
      checkouts: 0,
      purchases: 0,
    })
  })
})
