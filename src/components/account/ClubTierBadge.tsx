import type { ClubTier } from '@/lib/club/tiers'
import '@/styles/club-tier-badge.css'

/** Small pill with the customer's club tier. Used on the profile and in checkout. */
export function ClubTierBadge({ tier }: { tier: ClubTier }) {
  return (
    <span className={`club-tier-badge club-tier-badge--${tier.code}`} data-tier={tier.code}>
      {tier.nameHe}
    </span>
  )
}
