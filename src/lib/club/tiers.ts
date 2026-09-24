import { type Agorot, agorot, divRoundHalfUp } from '@/lib/money'

/**
 * Customer club tiers, decided by what the customer paid on the site over the
 * trailing twelve months.
 *
 * Pure: the window, which orders count, the thresholds and the standing they
 * produce. The read that feeds it is `server/queries/club.ts`; the card that
 * shows it is `components/account/ClubTierCard.tsx`.
 *
 * THE NUMBER IS WHAT THE CUSTOMER PAID, NOT THE FACE VALUE. `totalAgorot` from
 * `readOrderMoney` is the amount charged on the site (`customer_pays_now` after
 * 059, `total_ils` before it), so a ₪100 coupon bought for ₪20 up front counts
 * ₪20. Wallet credit applied at checkout is money the customer earned here and
 * is not subtracted again: it is already inside the charged total.
 *
 * WHICH ORDERS COUNT. Paid and not reversed. `pending` never paid, `cancelled`
 * and `refunded` gave the money back. `partially_fulfilled`, `fulfilled` and
 * `platform_settled` are all later states of a paid order and keep counting:
 * a tier that dropped the day a coupon was scanned would be wrong at the moment
 * the customer is most likely to look.
 *
 * THE WINDOW IS 365 DAYS FROM THE MOMENT OF THE READ, BY `paid_at`. `created_at`
 * stands in only for a paid row with no `paid_at`, which the finalize path
 * always writes; the fallback exists so a legacy row is not silently dropped.
 *
 * THRESHOLDS ARE INTEGER AGOROT and the tier is a step function, so every tier
 * boundary is one integer comparison. Progress towards the next tier is a
 * half-up integer percentage through `divRoundHalfUp`; no float touches money.
 */

export const CLUB_WINDOW_DAYS = 365

/** Order statuses that count towards club spend. Paid, and not reversed. */
export const CLUB_SPEND_STATUSES = [
  'paid',
  'partially_fulfilled',
  'fulfilled',
  'platform_settled',
] as const

export type ClubSpendStatus = (typeof CLUB_SPEND_STATUSES)[number]

export type ClubTierId = 'member' | 'silver' | 'gold' | 'platinum'

export interface ClubTier {
  id: ClubTierId
  /** Twelve-month spend, in agorot, from which the tier applies. */
  minAgorot: Agorot
}

/** The floor: applies to everybody, including a customer with no orders. */
export const CLUB_FLOOR_TIER: ClubTier = { id: 'member', minAgorot: agorot(0) }

/** Ascending. The first entry is the floor. */
export const CLUB_TIERS: readonly ClubTier[] = [
  CLUB_FLOOR_TIER,
  { id: 'silver', minAgorot: agorot(100_000) }, // ₪1,000
  { id: 'gold', minAgorot: agorot(300_000) }, // ₪3,000
  { id: 'platinum', minAgorot: agorot(1_000_000) }, // ₪10,000
]

export interface ClubStanding {
  tier: ClubTier
  spendAgorot: Agorot
  /** The tier above the current one, or null at the top. */
  nextTier: ClubTier | null
  /** What is still needed to reach `nextTier`; 0 at the top. */
  remainingAgorot: Agorot
  /** Integer 0..100: how far through the current tier's band the spend is. 100 at the top. */
  progressPercent: number
  /** Start of the window the spend was summed over, ISO. */
  windowStart: string
}

export function isClubSpendStatus(status: string): status is ClubSpendStatus {
  return (CLUB_SPEND_STATUSES as readonly string[]).includes(status)
}

/** The instant 365 days before `now`, as ISO. */
export function clubWindowStart(now: Date): string {
  return new Date(now.getTime() - CLUB_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()
}

export interface ClubOrderRow {
  status: string
  paid_at: string | null
  created_at: string
  totalAgorot: Agorot
}

/**
 * Sum of what the customer paid on qualifying orders inside the window.
 * Rows outside the window, in a non-counting status, or with a non-positive
 * total contribute nothing.
 */
export function sumClubSpend(rows: readonly ClubOrderRow[], now: Date): Agorot {
  const start = Date.parse(clubWindowStart(now))
  const end = now.getTime()
  let total = 0
  for (const row of rows) {
    if (!isClubSpendStatus(row.status)) continue
    const at = Date.parse(row.paid_at ?? row.created_at)
    if (!Number.isFinite(at) || at < start || at > end) continue
    if (!Number.isSafeInteger(row.totalAgorot) || row.totalAgorot <= 0) continue
    total += row.totalAgorot
  }
  return agorot(total)
}

/** The tier a twelve-month spend earns. */
export function clubTierForSpend(spendAgorot: Agorot): ClubTier {
  let tier: ClubTier = CLUB_FLOOR_TIER
  for (const candidate of CLUB_TIERS) {
    if (spendAgorot >= candidate.minAgorot) tier = candidate
  }
  return tier
}

export function clubStanding(spendAgorot: Agorot, now: Date): ClubStanding {
  const tier = clubTierForSpend(spendAgorot)
  const index = CLUB_TIERS.findIndex((t) => t.id === tier.id)
  const nextTier = CLUB_TIERS[index + 1] ?? null
  if (!nextTier) {
    return {
      tier,
      spendAgorot,
      nextTier: null,
      remainingAgorot: agorot(0),
      progressPercent: 100,
      windowStart: clubWindowStart(now),
    }
  }
  const band = nextTier.minAgorot - tier.minAgorot
  const into = spendAgorot - tier.minAgorot
  const progressPercent = Math.min(99, Math.max(0, divRoundHalfUp(into * 100, band)))
  return {
    tier,
    spendAgorot,
    nextTier,
    remainingAgorot: agorot(nextTier.minAgorot - spendAgorot),
    progressPercent,
    windowStart: clubWindowStart(now),
  }
}
