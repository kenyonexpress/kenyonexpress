import { type Agorot, agorot } from '@/lib/money'

export interface ClubTier {
  code: string
  nameHe: string
  minSpendAgorot: Agorot
  rank: number
}

/** Mirror of the club_tiers seed in migration 164; the table is the source of truth. */
export const DEFAULT_CLUB_TIERS: readonly ClubTier[] = [
  { code: 'bronze', nameHe: 'ברונזה', minSpendAgorot: agorot(0), rank: 1 },
  { code: 'silver', nameHe: 'כסף', minSpendAgorot: agorot(200_000), rank: 2 },
  { code: 'gold', nameHe: 'זהב', minSpendAgorot: agorot(500_000), rank: 3 },
  { code: 'platinum', nameHe: 'פלטינום', minSpendAgorot: agorot(1_500_000), rank: 4 },
]

export interface ClubStanding {
  current: ClubTier
  next: ClubTier | null
  spendAgorot: Agorot
  /** Integer agorot still needed for the next tier; 0 at the top. */
  remainingAgorot: Agorot
  /** Whole percent 0-100 toward the next tier, integer math. */
  progressPercent: number
}

export function clubStanding(
  spendAgorot: Agorot,
  tiers: readonly ClubTier[] = DEFAULT_CLUB_TIERS,
): ClubStanding {
  const sorted = [...tiers].sort((a, b) => a.rank - b.rank)
  let current = sorted[0] ?? DEFAULT_CLUB_TIERS[0]!
  for (const t of sorted) if (t.minSpendAgorot <= spendAgorot) current = t
  const next = sorted.find((t) => t.rank > current.rank) ?? null
  if (!next) {
    return { current, next, spendAgorot, remainingAgorot: agorot(0), progressPercent: 100 }
  }
  const span = next.minSpendAgorot - current.minSpendAgorot
  const done = spendAgorot - current.minSpendAgorot
  return {
    current,
    next,
    spendAgorot,
    remainingAgorot: agorot(next.minSpendAgorot - spendAgorot),
    progressPercent: span > 0 ? Math.min(100, Math.floor((done * 100) / span)) : 100,
  }
}
