import { type Agorot, agorot } from '@/lib/money'

/**
 * Club tiers: a customer's tier is a pure function of what they paid in the
 * last 12 months. Integer agorot throughout, no stored tier to drift.
 *
 * Thresholds and labels are code-defined defaults. Benefits are deliberately
 * not listed here: nothing in checkout grants one yet, and a tier page that
 * promises a benefit the system does not apply is a false claim.
 */
interface ClubTier {
  key: 'basic' | 'silver' | 'gold' | 'platinum'
  labelHe: string
  /** Minimum trailing-12-month spend, agorot. */
  minSpendAgorot: Agorot
}

const CLUB_TIERS: readonly ClubTier[] = [
  { key: 'basic', labelHe: 'חבר', minSpendAgorot: agorot(0) },
  { key: 'silver', labelHe: 'כסף', minSpendAgorot: agorot(100_000) },
  { key: 'gold', labelHe: 'זהב', minSpendAgorot: agorot(300_000) },
  { key: 'platinum', labelHe: 'פלטינה', minSpendAgorot: agorot(750_000) },
]

const YEAR_DAYS = 365
const DAY_MS = 86_400_000

export interface SpendOrder {
  totalAgorot: number
  paidAt: string | null
  status: string
}

/** Paid, not cancelled or refunded, inside the trailing 12 months. */
export function trailingSpend(orders: readonly SpendOrder[], now: Date): Agorot {
  const since = now.getTime() - YEAR_DAYS * DAY_MS
  let total = 0
  for (const o of orders) {
    if (!o.paidAt || o.status === 'cancelled' || o.status === 'refunded') continue
    const at = new Date(o.paidAt).getTime()
    if (Number.isNaN(at) || at < since || at > now.getTime()) continue
    total += o.totalAgorot
  }
  return agorot(total)
}

export interface ClubStanding {
  tier: ClubTier
  next: ClubTier | null
  spendAgorot: Agorot
  /** Agorot still needed for the next tier; 0 at the top. */
  toNextAgorot: Agorot
}

export function clubStanding(spendAgorot: Agorot): ClubStanding {
  let index = 0
  CLUB_TIERS.forEach((t, i) => {
    if (spendAgorot >= t.minSpendAgorot) index = i
  })
  const tier = CLUB_TIERS[index] as ClubTier
  const next = CLUB_TIERS[index + 1] ?? null
  return {
    tier,
    next,
    spendAgorot,
    toNextAgorot: agorot(next ? next.minSpendAgorot - spendAgorot : 0),
  }
}
