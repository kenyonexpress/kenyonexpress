import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { agorot } from '@/lib/money'
import { describe, expect, it } from 'vitest'
import {
  EXCLUDED_ORDER_STATUSES,
  LOYALTY_TIERS,
  LOYALTY_WINDOW_DAYS,
  TIER_BENEFITS_HE,
  TIER_LABEL_HE,
  TIER_THRESHOLDS_AGOROT,
  isLoyaltyTier,
  lockedDealLabel,
  meetsTier,
  nextTier,
  spendInWindow,
  tierForSpend,
  tierProgress,
  tierRank,
  tierRequiredMessage,
  windowStart,
} from './tiers'

const NOW = new Date('2026-10-08T12:00:00Z')

describe('the ladder', () => {
  it('is bronze, silver, gold in that order with rising integer thresholds', () => {
    expect([...LOYALTY_TIERS]).toEqual(['bronze', 'silver', 'gold'])
    expect(TIER_THRESHOLDS_AGOROT.bronze).toBe(0)
    expect(TIER_THRESHOLDS_AGOROT.silver).toBe(100_000)
    expect(TIER_THRESHOLDS_AGOROT.gold).toBe(300_000)
    for (const tier of LOYALTY_TIERS) {
      expect(Number.isSafeInteger(TIER_THRESHOLDS_AGOROT[tier])).toBe(true)
    }
    expect(tierRank('bronze')).toBe(0)
    expect(tierRank('gold')).toBe(2)
  })

  it('places a spend on the highest threshold it reaches, bronze as the floor', () => {
    expect(tierForSpend(agorot(0))).toBe('bronze')
    expect(tierForSpend(agorot(99_999))).toBe('bronze')
    expect(tierForSpend(agorot(100_000))).toBe('silver')
    expect(tierForSpend(agorot(299_999))).toBe('silver')
    expect(tierForSpend(agorot(300_000))).toBe('gold')
    expect(tierForSpend(agorot(9_000_000))).toBe('gold')
  })

  it('knows the tier above and that gold has none', () => {
    expect(nextTier('bronze')).toBe('silver')
    expect(nextTier('silver')).toBe('gold')
    expect(nextTier('gold')).toBeNull()
  })

  it('has Hebrew for every tier, a label and at least one benefit', () => {
    for (const tier of LOYALTY_TIERS) {
      expect(TIER_LABEL_HE[tier]).toMatch(/[֐-׿]/)
      expect(TIER_BENEFITS_HE[tier].length).toBeGreaterThan(0)
      for (const line of TIER_BENEFITS_HE[tier]) expect(line).toMatch(/[֐-׿]/)
    }
    expect(lockedDealLabel('silver')).toContain('כסף')
    expect(lockedDealLabel('gold')).toContain('זהב')
    expect(tierRequiredMessage('silver')).toContain('כסף')
    expect(tierRequiredMessage('gold')).toContain('זהב')
  })

  it('recognises only the three names', () => {
    expect(isLoyaltyTier('gold')).toBe(true)
    expect(isLoyaltyTier('platinum')).toBe(false)
    expect(isLoyaltyTier(null)).toBe(false)
  })
})

describe('meetsTier: the gate the cart applies', () => {
  it('opens an ungated deal to everyone, including a guest', () => {
    expect(meetsTier(null, null)).toBe(true)
    expect(meetsTier('bronze', null)).toBe(true)
  })

  it('refuses a guest everything gated, and a lower tier the higher deal', () => {
    expect(meetsTier(null, 'silver')).toBe(false)
    expect(meetsTier('bronze', 'silver')).toBe(false)
    expect(meetsTier('silver', 'gold')).toBe(false)
  })

  it('admits the tier itself and anything above it', () => {
    expect(meetsTier('silver', 'silver')).toBe(true)
    expect(meetsTier('gold', 'silver')).toBe(true)
    expect(meetsTier('gold', 'gold')).toBe(true)
  })
})

describe('tierProgress', () => {
  it('measures the way to the next tier in integer agorot and whole percent', () => {
    const p = tierProgress(agorot(25_000))
    expect(p).toEqual({ tier: 'bronze', next: 'silver', remainingAgorot: 75_000, percent: 25 })
    expect(Number.isSafeInteger(p.remainingAgorot)).toBe(true)
  })

  it('never shows 100% short of the next tier, and 100% with nothing left at the top', () => {
    expect(tierProgress(agorot(299_999)).percent).toBe(99)
    expect(tierProgress(agorot(300_000))).toEqual({
      tier: 'gold',
      next: null,
      remainingAgorot: 0,
      percent: 100,
    })
  })

  it('starts each tier at zero percent of the way to the next', () => {
    expect(tierProgress(agorot(100_000))).toEqual({
      tier: 'silver',
      next: 'gold',
      remainingAgorot: 200_000,
      percent: 0,
    })
  })
})

describe('spendInWindow: what counts', () => {
  const paid = (daysAgo: number, totalAgorot: number, status = 'paid') => ({
    status,
    paidAt: new Date(NOW.getTime() - daysAgo * 24 * 60 * 60 * 1000).toISOString(),
    totalAgorot: agorot(totalAgorot),
  })

  it('is a 365-day window measured from now', () => {
    expect(LOYALTY_WINDOW_DAYS).toBe(365)
    expect(windowStart(NOW).toISOString()).toBe('2025-10-08T12:00:00.000Z')
  })

  it('sums paid orders inside the window and nothing outside it', () => {
    const orders = [paid(1, 50_000), paid(364, 60_000), paid(366, 1_000_000)]
    expect(spendInWindow(orders, NOW)).toBe(110_000)
  })

  it('ignores an unpaid order whatever its status says', () => {
    const orders = [{ status: 'paid', paidAt: null, totalAgorot: agorot(500_000) }]
    expect(spendInWindow(orders, NOW)).toBe(0)
  })

  it('ignores cancelled and refunded orders, and only those', () => {
    expect([...EXCLUDED_ORDER_STATUSES]).toEqual(['cancelled', 'refunded'])
    const orders = [
      paid(2, 100_000, 'cancelled'),
      paid(3, 100_000, 'refunded'),
      paid(4, 10_000, 'fulfilled'),
      paid(5, 10_000, 'partially_fulfilled'),
      paid(6, 10_000, 'platform_settled'),
    ]
    expect(spendInWindow(orders, NOW)).toBe(30_000)
  })

  it('ignores a paid_at in the future or unparsable', () => {
    const orders = [
      paid(-1, 100_000),
      { status: 'paid', paidAt: 'not a date', totalAgorot: agorot(100_000) },
    ]
    expect(spendInWindow(orders, NOW)).toBe(0)
  })

  it('returns an integer', () => {
    expect(Number.isSafeInteger(spendInWindow([paid(1, 12_345)], NOW))).toBe(true)
  })
})

describe('the SQL twin agrees', () => {
  // `fn_refresh_loyalty_tier` decides the tier in the database after each
  // paid order, so that an upgrade is announced once. Two copies of a
  // threshold is one copy too many unless something holds them together.
  const sql = readFileSync(
    resolve(process.cwd(), 'migrations/pending/261_loyalty_tiers.sql'),
    'utf8',
  )

  it('carries the same two thresholds, the same window and the same exclusions', () => {
    expect(sql).toContain(`v_silver constant bigint := ${TIER_THRESHOLDS_AGOROT.silver};`)
    expect(sql).toContain(`v_gold   constant bigint := ${TIER_THRESHOLDS_AGOROT.gold};`)
    expect(sql).toContain(`interval '${LOYALTY_WINDOW_DAYS} days'`)
    expect(sql).toContain("status NOT IN ('cancelled', 'refunded')")
    expect(sql).toContain('paid_at IS NOT NULL')
  })

  it('accepts exactly the three tier names', () => {
    expect(sql).toContain("CHECK (tier IN ('bronze', 'silver', 'gold'))")
    expect(sql).toContain("CHECK (min_loyalty_tier IN ('silver', 'gold'))")
  })
})
