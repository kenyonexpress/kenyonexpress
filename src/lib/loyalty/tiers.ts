import { type Agorot, agorot } from '@/lib/money'

/**
 * Loyalty tiers (STEP 47): bronze, silver and gold, decided by what the
 * customer paid on the site over the trailing twelve months.
 *
 * PURE. No IO, no clock of its own. The window, the thresholds and the
 * arithmetic live here and nowhere else in TypeScript; the SQL twin in
 * `migrations/pending/261_loyalty_tiers.sql` (`fn_refresh_loyalty_tier`)
 * carries the same two thresholds, and `tiers.test.ts` reads that file and
 * fails if the numbers drift apart.
 *
 * WHAT COUNTS AS SPEND. An order counts when it was paid (`paid_at` set,
 * the same definition `fn_cashback_order_bonus` and the referral programme
 * use), is not cancelled and not refunded, and was paid inside the window.
 * The amount is the order's on-site total in integer agorot, the figure the
 * card was charged, not the sticker subtotal: wallet credit and discounts
 * already came off it, and a tier bought with credit the site handed out
 * would be a tier that funds itself.
 *
 * WHY THE TIER IS COMPUTED LIVE AND NOT READ FROM A COLUMN. The window
 * rolls every day, so any stored tier is stale the morning after it was
 * written. The account page, the badge and the discount gate all call
 * `tierForSpend` over the customer's own orders at request time; the
 * `loyalty_tiers` row (261) remembers only which tier the customer was
 * last TOLD about, so an upgrade is announced once and a downgrade is never
 * announced at all. A customer who slips from gold to silver sees it on the
 * page and gets no mail about it.
 */

export const LOYALTY_TIERS = ['bronze', 'silver', 'gold'] as const
export type LoyaltyTier = (typeof LOYALTY_TIERS)[number]

/** Days in the trailing window. A year, counted in days so the SQL twin can say `interval '365 days'`. */
export const LOYALTY_WINDOW_DAYS = 365

/**
 * The spend, in integer agorot, at which each tier begins. Bronze is the
 * floor: every signed-in customer is at least bronze, with no purchase at
 * all. ₪1,000 reaches silver, ₪3,000 reaches gold.
 */
export const TIER_THRESHOLDS_AGOROT: Readonly<Record<LoyaltyTier, Agorot>> = {
  bronze: agorot(0),
  silver: agorot(100_000),
  gold: agorot(300_000),
}

export const TIER_LABEL_HE: Readonly<Record<LoyaltyTier, string>> = {
  bronze: 'ברונזה',
  silver: 'כסף',
  gold: 'זהב',
}

/**
 * What each tier is worth, in the customer's words. Tier-only deals are
 * discount campaigns an admin marks with a minimum tier (261 adds
 * `discount_campaigns.min_loyalty_tier`); the cart refuses the code below
 * that tier, so the sentence here is a promise the engine keeps.
 */
export const TIER_BENEFITS_HE: Readonly<Record<LoyaltyTier, readonly string[]>> = {
  bronze: ['קאשבק על כל הזמנה', 'מעקב אחרי ההתקדמות לדרגת כסף'],
  silver: ['כל מה שבברונזה', 'קודי הנחה שמורים לחברי כסף וזהב'],
  gold: ['כל מה שבכסף', 'קודי הנחה שמורים לחברי זהב בלבד', 'הודעה ראשונים על מבצעים חדשים'],
}

export function isLoyaltyTier(value: unknown): value is LoyaltyTier {
  return typeof value === 'string' && (LOYALTY_TIERS as readonly string[]).includes(value)
}

/** 0 for bronze, 1 for silver, 2 for gold. */
export function tierRank(tier: LoyaltyTier): number {
  return LOYALTY_TIERS.indexOf(tier)
}

/** Highest tier whose threshold the spend reaches. Never below bronze. */
export function tierForSpend(spendAgorot: Agorot): LoyaltyTier {
  let tier: LoyaltyTier = 'bronze'
  for (const candidate of LOYALTY_TIERS) {
    if (spendAgorot >= TIER_THRESHOLDS_AGOROT[candidate]) tier = candidate
  }
  return tier
}

/** The tier above, or null at the top. */
export function nextTier(tier: LoyaltyTier): LoyaltyTier | null {
  return LOYALTY_TIERS[tierRank(tier) + 1] ?? null
}

/**
 * Does a customer at `have` get what `need` unlocks? Null `need` is "open to
 * everyone"; null `have` is a guest, who is not a member at any tier and
 * gets nothing tier-gated.
 */
export function meetsTier(have: LoyaltyTier | null, need: LoyaltyTier | null): boolean {
  if (need === null) return true
  if (have === null) return false
  return tierRank(have) >= tierRank(need)
}

export interface TierProgress {
  tier: LoyaltyTier
  next: LoyaltyTier | null
  /** Integer agorot still to spend inside the window to reach `next`; 0 at the top. */
  remainingAgorot: Agorot
  /** Whole percent of the way from this tier's floor to the next, 100 at the top. */
  percent: number
}

/** Where the spend sits between its tier's floor and the next one. */
export function tierProgress(spendAgorot: Agorot): TierProgress {
  const tier = tierForSpend(spendAgorot)
  const next = nextTier(tier)
  if (next === null) return { tier, next: null, remainingAgorot: agorot(0), percent: 100 }
  const floor = TIER_THRESHOLDS_AGOROT[tier]
  const ceiling = TIER_THRESHOLDS_AGOROT[next]
  const remaining = agorot(Math.max(0, ceiling - spendAgorot))
  // Integer percent over integer agorot: no float reaches a money value, and
  // the bar is a picture, not a sum.
  const span = ceiling - floor
  const percent = Math.min(99, Math.floor(((spendAgorot - floor) * 100) / span))
  return { tier, next, remainingAgorot: remaining, percent: Math.max(0, percent) }
}

/** The instant the window opens, `LOYALTY_WINDOW_DAYS` before `now`. */
export function windowStart(now: Date): Date {
  return new Date(now.getTime() - LOYALTY_WINDOW_DAYS * 24 * 60 * 60 * 1000)
}

/** The order statuses whose money does not count, whatever `paid_at` says. */
export const EXCLUDED_ORDER_STATUSES: readonly string[] = ['cancelled', 'refunded']

export interface SpendableOrder {
  status: string
  paidAt: string | null
  totalAgorot: Agorot
}

/**
 * The customer's spend inside the window, integer agorot, over rows that
 * already carry their money as integers (`getMyOrders` and the lean read in
 * `server/queries/loyalty.ts` both do).
 */
export function spendInWindow(orders: readonly SpendableOrder[], now: Date): Agorot {
  const start = windowStart(now).getTime()
  let sum = 0
  for (const order of orders) {
    if (order.paidAt === null) continue
    if (EXCLUDED_ORDER_STATUSES.includes(order.status)) continue
    const paid = new Date(order.paidAt).getTime()
    if (Number.isNaN(paid) || paid < start || paid > now.getTime()) continue
    sum += order.totalAgorot
  }
  return agorot(sum)
}

/** The sentence under a locked tier-only deal. */
export function lockedDealLabel(need: LoyaltyTier): string {
  return need === 'gold' ? 'נפתח בדרגת זהב' : `נפתח בדרגת ${TIER_LABEL_HE[need]} ומעלה`
}

/** The refusal the cart gives a code the customer's tier does not unlock. */
export function tierRequiredMessage(need: LoyaltyTier): string {
  return need === 'gold'
    ? 'הקוד הזה שמור לחברי מועדון בדרגת זהב'
    : `הקוד הזה שמור לחברי מועדון בדרגת ${TIER_LABEL_HE[need]} ומעלה`
}
