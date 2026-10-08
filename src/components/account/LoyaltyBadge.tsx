import { type LoyaltyTier, TIER_LABEL_HE } from '@/lib/loyalty/tiers'

/**
 * The tier chip (STEP 47): one word in Hebrew on a tone per tier. Pure
 * markup over the shared label table, so the nav, the overview tile and the
 * loyalty page spell the tier the same way. Server and client safe: no
 * hooks, no IO.
 */
export default function LoyaltyBadge({
  tier,
  size = 'sm',
}: {
  tier: LoyaltyTier
  size?: 'sm' | 'lg'
}) {
  return (
    <span
      className={`loyalty-badge loyalty-badge--${tier}${size === 'lg' ? ' loyalty-badge--lg' : ''}`}
      data-tier={tier}
    >
      דרגת {TIER_LABEL_HE[tier]}
    </span>
  )
}
