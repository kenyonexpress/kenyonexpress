/**
 * Cashback tiers, for PostHog cohorts and nothing else.
 *
 * A cohort in PostHog is a person-property filter ("cashback_tier = gold"),
 * and a person property must be a small stable label, not a number that
 * changes every purchase. So the wallet's lifetime cashback (integer agorot,
 * summed from the credit entries the ledger already holds) is bucketed here
 * into four names. The thresholds are analytics segmentation, not a loyalty
 * program: nothing in the product grants or denies anything off them, and
 * moving a boundary re-buckets reports without touching money.
 *
 * This module does no money arithmetic, only comparisons against integer
 * agorot produced upstream by src/lib/money.ts helpers, which keeps it on the
 * right side of the "all money math goes through money.ts" rule.
 */

export const CASHBACK_TIERS = ['none', 'bronze', 'silver', 'gold'] as const
export type CashbackTier = (typeof CASHBACK_TIERS)[number]

/** The person-property key, exactly as cohorts filter on it in PostHog. */
export const CASHBACK_TIER_PROPERTY = 'cashback_tier'

/**
 * Lower bounds in integer agorot, inclusive. bronze starts at the first agora
 * ever earned; silver at 100 shekels lifetime; gold at 500. Ordered ascending
 * so the matcher can walk it from the top.
 */
export const CASHBACK_TIER_MIN_AGOROT: Record<Exclude<CashbackTier, 'none'>, number> = {
  bronze: 1,
  silver: 10_000,
  gold: 50_000,
}

/**
 * Buckets a lifetime-earned total. Anything unusable (negative, NaN,
 * Infinity, a float that slipped past the integer rule) buckets conservatively
 * rather than throwing: a cohort label is never worth an error, and 'none' is
 * the label that claims the least.
 */
export function cashbackTier(lifetimeEarnedAgorot: number): CashbackTier {
  if (!Number.isSafeInteger(lifetimeEarnedAgorot) || lifetimeEarnedAgorot <= 0) return 'none'
  if (lifetimeEarnedAgorot >= CASHBACK_TIER_MIN_AGOROT.gold) return 'gold'
  if (lifetimeEarnedAgorot >= CASHBACK_TIER_MIN_AGOROT.silver) return 'silver'
  return 'bronze'
}
