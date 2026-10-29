import '@/styles/tier-badge.css'

interface TierBadgeProps {
  tierKey: string
  nameHe: string
}

const KNOWN_TIERS = new Set(['bronze', 'silver', 'gold', 'platinum'])

/** Club tier chip shown on the profile and at checkout. Name comes from club_tiers. */
export default function TierBadge({ tierKey, nameHe }: TierBadgeProps) {
  const tone = KNOWN_TIERS.has(tierKey) ? tierKey : 'bronze'
  return (
    <span className={`tier-badge tier-badge--${tone}`} data-tier={tierKey}>
      {nameHe}
    </span>
  )
}
