import { describe, expect, it } from 'vitest'
import { CASHBACK_TIERS, CASHBACK_TIER_MIN_AGOROT, cashbackTier } from './cashback-tier'

/**
 * The tier boundaries are cohort definitions: an analyst builds a PostHog
 * cohort against these exact labels, so a silent shift in a boundary quietly
 * rewrites who "gold" means across every report. The table pins each edge.
 */
describe('cashbackTier', () => {
  it('buckets each boundary exactly', () => {
    expect(cashbackTier(0)).toBe('none')
    expect(cashbackTier(1)).toBe('bronze')
    expect(cashbackTier(9_999)).toBe('bronze')
    expect(cashbackTier(10_000)).toBe('silver')
    expect(cashbackTier(49_999)).toBe('silver')
    expect(cashbackTier(50_000)).toBe('gold')
    expect(cashbackTier(5_000_000)).toBe('gold')
  })

  it('buckets anything unusable as none rather than throwing', () => {
    expect(cashbackTier(-1)).toBe('none')
    expect(cashbackTier(Number.NaN)).toBe('none')
    expect(cashbackTier(Number.POSITIVE_INFINITY)).toBe('none')
    // A float on the money path is a bug upstream; the label stays safe.
    expect(cashbackTier(10_000.5)).toBe('none')
  })

  it('keeps the threshold table and the tier list in agreement', () => {
    const paying = CASHBACK_TIERS.filter((tier) => tier !== 'none')
    expect(Object.keys(CASHBACK_TIER_MIN_AGOROT).sort()).toEqual([...paying].sort())
    // Ascending and positive, or the walk in cashbackTier stops meaning rank.
    expect(CASHBACK_TIER_MIN_AGOROT.bronze).toBeGreaterThan(0)
    expect(CASHBACK_TIER_MIN_AGOROT.silver).toBeGreaterThan(CASHBACK_TIER_MIN_AGOROT.bronze)
    expect(CASHBACK_TIER_MIN_AGOROT.gold).toBeGreaterThan(CASHBACK_TIER_MIN_AGOROT.silver)
    // Every threshold maps back to its own tier.
    for (const [tier, min] of Object.entries(CASHBACK_TIER_MIN_AGOROT)) {
      expect(cashbackTier(min)).toBe(tier)
    }
  })
})
