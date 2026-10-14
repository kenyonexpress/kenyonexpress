import { formatCountdown } from './below-fold-rules'

/**
 * The hot-coupon card's countdown to `coupon_deals.valid_until`, derived once
 * per tick and pure, so the figures can be tested without a clock of their own.
 *
 * THE RULE IT KEEPS. Israeli consumer law limits urgency claims to ones the
 * seller can substantiate (`lib/commerce/coupon-expiry.ts` says the same for
 * the product page), so every number here traces to the column: a deal with no
 * `valid_until` gets NO countdown at all, not "hurry" and not a dash. The card
 * only mounts the island when the column is set and parses.
 *
 * SHAPE. Days are whole days left and the clock is the remainder under a day
 * as `HH:MM:SS`, so "מסתיים בעוד 3 ימים 04:12:33" reads as one figure that
 * ticks every second (the same `formatCountdown` the deal of the day uses).
 * Under a day there is no day word and the pill turns urgent; past the
 * deadline it reads "המבצע הסתיים" and stops. The cached home read already
 * drops a deal whose deadline has passed, so the ended state is only reached
 * by a tab left open across the deadline, and then it has to be honest.
 */

export type CouponCountdownUrgency = 'none' | 'soon' | 'today' | 'ended'

export interface CouponCountdown {
  ended: boolean
  /** Whole days left; 0 under a day and once ended. */
  days: number
  /** `HH:MM:SS` of the remainder under a day; `00:00:00` once ended. */
  clock: string
  /** "יום אחד" / "יומיים" / "3 ימים"; null under a day and once ended. */
  daysLabel: string | null
  urgency: CouponCountdownUrgency
}

const DAY_MS = 86_400_000

/** Under four days the deal is "soon"; under one it is "today". */
export const SOON_DAYS = 3

export function daysLabelHe(days: number): string | null {
  if (days <= 0) return null
  if (days === 1) return 'יום אחד'
  if (days === 2) return 'יומיים'
  return `${days} ימים`
}

export function describeCouponCountdown(validUntil: Date, now: Date): CouponCountdown {
  const remainingMs = validUntil.getTime() - now.getTime()
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) {
    return { ended: true, days: 0, clock: '00:00:00', daysLabel: null, urgency: 'ended' }
  }
  const days = Math.floor(remainingMs / DAY_MS)
  const rest = remainingMs - days * DAY_MS
  const clock = formatCountdown(Math.floor(rest / 1000))
  const urgency: CouponCountdownUrgency = days === 0 ? 'today' : days <= SOON_DAYS ? 'soon' : 'none'
  return { ended: false, days, clock, daysLabel: daysLabelHe(days), urgency }
}

/**
 * The ISO deadline a card may count down to, or null: an unset column, or a
 * value Postgres accepted but `Date` cannot parse, mounts no island.
 */
export function countdownDeadline(validUntil: string | null | undefined): string | null {
  if (!validUntil) return null
  return Number.isNaN(Date.parse(validUntil)) ? null : validUntil
}
