/**
 * Velocity limits: the part of this layer that actually REFUSES.
 *
 * WHY THESE REFUSE AND THE SCORE DOES NOT. Each rule below counts one thing
 * over one window and can be read aloud to the person it stopped ("five cards
 * were declined on this account in the last hour"). A risk score cannot; it is
 * a weighted sum with no measured base rate behind it, and refusing a purchase
 * on one would decline real customers at a rate nobody here could state. So the
 * counting rules are the wall and the score is the queue. `risk-score.ts` says
 * the same thing from the other side.
 *
 * WHY NOT JUST MORE RATE LIMITS. `lib/rate-limit` counts REQUESTS against a key
 * and forgets everything else; these count OUTCOMES in the database - declines,
 * distinct cards, one card across accounts. A card tester who paces themselves
 * under ten checkouts a minute passes every rate limit in the table and is
 * exactly who these catch. The two layers stack: `begin_checkout` still bounds
 * the button, and these bound the behaviour.
 *
 * THE NUMBERS ARE CEILINGS ON A SHAPE, NOT AVERAGES. Each is set well above
 * what a real shopper does and well below what the abuse needs, and each says
 * which side it was set from. None was fitted to data, because there is none;
 * every one of them is stated here so it can be moved when there is.
 */

export type VelocityRule = 'declined_payments' | 'distinct_cards' | 'card_across_accounts'

export type VelocityCounts = {
  /** `payments.status = 'failed'` for this user in the last hour. */
  declinedPaymentsLastHour: number
  /** Distinct `payment_tokens` this profile charged in the last 24 hours. */
  distinctCardsLastDay: number
  /** Distinct profiles holding the token about to be charged, this one included. */
  profilesSharingCard: number
}

export type VelocityDecision =
  | { allowed: true }
  | { allowed: false; rule: VelocityRule; message: string }

export const VELOCITY_LIMITS = {
  /**
   * Five declines in an hour. A real shopper mistypes a CVV twice and gives up
   * or calls the bank; card testing IS this number, repeated. Set from the
   * abuse side: a tester needs dozens of attempts for the exercise to pay, and
   * five is already generous for a genuine mistake.
   */
  declinedPaymentsLastHour: 5,
  /**
   * Five distinct saved cards in a day, from ONE account. A household has two
   * or three (personal, spouse, business) and uses them across weeks, not in an
   * afternoon. Set from the shopper side: four would catch a family sharing an
   * account on a holiday, and the cost of that false positive is a lost sale.
   */
  distinctCardsLastDay: 5,
  /**
   * One card token appearing on four or more accounts. NOT three: a parent
   * paying for two children is three accounts on one card and is not fraud,
   * which is the same reason `same_card` in the referral queue flags rather
   * than rejects. Four is where the family explanation stops being the simplest
   * one. This is the only rule here whose subject is the CARD rather than the
   * account, and it is the one that catches a stolen number spread across
   * freshly minted profiles - the shape no per-account limit can see.
   */
  profilesSharingCard: 4,
} as const

const MESSAGES: Record<VelocityRule, string> = {
  declined_payments:
    'נרשמו יותר מדי ניסיונות תשלום שנכשלו בשעה האחרונה. נסו שוב מאוחר יותר או פנו אלינו.',
  distinct_cards: 'נעשה שימוש בכרטיסים רבים מדי מהחשבון הזה היום. נסו שוב מחר או פנו אלינו.',
  card_across_accounts: 'לא ניתן לחייב את הכרטיס הזה כרגע. פנו אלינו ונשמח לעזור.',
}

/**
 * Pure. Order matters: the first rule that fires is the one the customer is
 * told about, and it is ordered from "you can see why" to "we are not going to
 * explain" - `card_across_accounts` deliberately says nothing about the other
 * accounts, because the caller may be the thief and the other account holder is
 * the victim.
 */
export function checkVelocity(counts: VelocityCounts): VelocityDecision {
  if (counts.declinedPaymentsLastHour >= VELOCITY_LIMITS.declinedPaymentsLastHour) {
    return { allowed: false, rule: 'declined_payments', message: MESSAGES.declined_payments }
  }
  if (counts.distinctCardsLastDay >= VELOCITY_LIMITS.distinctCardsLastDay) {
    return { allowed: false, rule: 'distinct_cards', message: MESSAGES.distinct_cards }
  }
  if (counts.profilesSharingCard >= VELOCITY_LIMITS.profilesSharingCard) {
    return { allowed: false, rule: 'card_across_accounts', message: MESSAGES.card_across_accounts }
  }
  return { allowed: true }
}
