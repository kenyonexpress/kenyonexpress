/**
 * The order risk score.
 *
 * WHAT IT DOES NOT DO, FIRST, BECAUSE THAT IS THE DESIGN. **A score never
 * refuses a purchase.** Not at any value. This shop has 44 active products, has
 * never measured a fraud rate, and has no chargeback history to fit a threshold
 * against; a number invented here and wired to a refusal would decline real
 * customers at a rate nobody could state, to prevent losses nobody has
 * observed. The refusals in this layer live in `velocity.ts`, where each one is
 * a narrow counting rule that can be explained to the person it stopped.
 *
 * What the score does is ROUTE. It decides whether a paid order sits in
 * `/admin/fraud` waiting for a human, and it gives that human the reasons in
 * the order they fired. That is the response `docs/ARCHITECTURE-FRAUD-RATE-LIMITS.md`
 * asked for and the one a shop this size can actually staff.
 *
 * WHY THE WEIGHTS ARE WHAT THEY ARE. They are not fitted, because there is
 * nothing to fit them to; they are ORDERED, which is the part that survives
 * having no data. A signal that means "this card has been declined four times
 * in an hour" outranks "this account is nine minutes old", and the bands are
 * then set so that any ONE strong signal reaches review on its own and two weak
 * ones do not. Re-tune when there are chargebacks to tune against, and record
 * the observation that moved a number.
 */

export type RiskReason =
  | 'card_declines'
  | 'many_cards'
  | 'card_shared_across_accounts'
  | 'fresh_account'
  | 'disposable_email'
  | 'first_order_high_value'
  | 'many_orders_from_ip'
  | 'gift_to_stranger'
  | 'coupon_stack_max'

/** Every reason, its weight, and the sentence an operator reads. */
export const RISK_REASONS: Record<RiskReason, { weight: number; he: string }> = {
  // -- Strong. Any one of these alone reaches the review band.
  card_declines: {
    weight: 40,
    he: 'כרטיסים נדחו שוב ושוב בשעה האחרונה מהחשבון הזה',
  },
  card_shared_across_accounts: {
    weight: 35,
    he: 'אותו כרטיס מופיע בכמה חשבונות',
  },
  many_cards: {
    weight: 30,
    he: 'כמה כרטיסים שונים באותו יום מאותו חשבון',
  },

  // -- Medium. Two of these reach review; one does not.
  disposable_email: { weight: 20, he: 'כתובת מייל חד-פעמית' },
  first_order_high_value: { weight: 20, he: 'הזמנה ראשונה בסכום גבוה' },
  many_orders_from_ip: { weight: 20, he: 'הרבה הזמנות מאותה כתובת IP' },

  // -- Weak. Present because they are worth SEEING next to a strong signal,
  // and deliberately too light to route anything on their own. A nine-minute-old
  // account is what every new customer has.
  fresh_account: { weight: 10, he: 'החשבון נפתח לפני זמן קצר' },
  gift_to_stranger: { weight: 10, he: 'שובר מתנה לנמען שאינו בעל החשבון' },
  coupon_stack_max: { weight: 10, he: 'ניצול מלא של ההנחות האפשריות' },
}

export type RiskBand = 'low' | 'elevated' | 'review'

/**
 * Where the bands sit, and what each one COSTS if it is wrong.
 *
 * `review` at 30 is exactly "one strong signal, or two medium ones". A false
 * positive costs an operator one glance at a queue; a false negative costs the
 * chargeback we were going to eat either way, because nothing here blocks. The
 * asymmetry is why the threshold is low rather than high.
 */
export const REVIEW_THRESHOLD = 30
export const ELEVATED_THRESHOLD = 15

export type RiskSignals = {
  /** Payments in `failed`/`declined` for this user in the last hour. */
  declinedPaymentsLastHour: number
  /** Distinct saved cards this profile used in the last 24h. */
  distinctCardsLastDay: number
  /** Distinct profiles that hold the card token being charged now. */
  profilesSharingCard: number
  /** Age of the account at order time. */
  accountAgeMinutes: number
  /** `isDisposableEmail` on the account address. */
  disposableEmail: boolean
  /** Paid orders this user has had before this one. */
  previousPaidOrders: number
  /** Order total, agorot. Integer, like every other money value here. */
  totalAgorot: number
  /** Orders created from this IP in the last hour, this one included. */
  ordersFromIpLastHour: number
  /**
   * NOT A FIELD, AND THE ABSENCE IS THE POINT.
   *
   * "Shipping country differs from the card country" is the standard signal
   * here and it is not in this table, because `public.user_addresses` has no
   * country column: city, street, zip, phone, and nothing else. Every address
   * this shop can hold is an Israeli one by construction, so the check would be
   * a constant. A reason that can never fire is worse than a missing one - it
   * reads as coverage in a review and costs a weight in the sum - which is the
   * same mistake `docs/RATE-LIMITS.md` made when it listed image upload as
   * covered. It becomes real the day an address grows a country.
   */
  /** The order carries a gift recipient who is not the buyer. */
  giftToOtherRecipient: boolean
  /** Wallet + discount together covered most of the basket. */
  discountShareBps: number
}

export type RiskAssessment = {
  score: number
  band: RiskBand
  reasons: RiskReason[]
}

/** ₪1,000. Above this a FIRST order is worth a look; a repeat customer is not. */
const HIGH_VALUE_FIRST_ORDER_AGOROT = 100_000

/** 30 minutes. Not "suspicious": just worth seeing beside something else. */
const FRESH_ACCOUNT_MINUTES = 30

/** 90% of the basket covered by wallet and codes. */
const MAX_DISCOUNT_SHARE_BPS = 9_000

/**
 * Pure. No clock, no database, no environment: everything it needs is in
 * `signals`, which is what makes the table above testable as a table.
 */
export function assessRisk(signals: RiskSignals): RiskAssessment {
  const reasons: RiskReason[] = []

  if (signals.declinedPaymentsLastHour >= 3) reasons.push('card_declines')
  if (signals.profilesSharingCard >= 2) reasons.push('card_shared_across_accounts')
  if (signals.distinctCardsLastDay >= 3) reasons.push('many_cards')

  if (signals.disposableEmail) reasons.push('disposable_email')
  if (signals.previousPaidOrders === 0 && signals.totalAgorot >= HIGH_VALUE_FIRST_ORDER_AGOROT) {
    reasons.push('first_order_high_value')
  }
  if (signals.ordersFromIpLastHour >= 5) reasons.push('many_orders_from_ip')

  if (signals.accountAgeMinutes < FRESH_ACCOUNT_MINUTES) reasons.push('fresh_account')
  if (signals.giftToOtherRecipient) reasons.push('gift_to_stranger')
  if (signals.discountShareBps >= MAX_DISCOUNT_SHARE_BPS) reasons.push('coupon_stack_max')

  // Heaviest first, so the operator reads the reason that routed the order
  // rather than the one that happens to be declared first.
  reasons.sort((a, b) => RISK_REASONS[b].weight - RISK_REASONS[a].weight)

  const score = Math.min(
    100,
    reasons.reduce((sum, reason) => sum + RISK_REASONS[reason].weight, 0),
  )

  const band: RiskBand =
    score >= REVIEW_THRESHOLD ? 'review' : score >= ELEVATED_THRESHOLD ? 'elevated' : 'low'

  return { score, band, reasons }
}

/** The Hebrew sentence for a stored reason, for the queue and for mail. */
export function riskReasonText(reason: string): string {
  return RISK_REASONS[reason as RiskReason]?.he ?? reason
}
