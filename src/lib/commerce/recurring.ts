/**
 * The recurring-charge product type: what a subscription costs, when it is next
 * billed, and which subscriptions a billing run may touch.
 *
 * This module is pure. It reads no database and no clock - every function that
 * needs "now" takes it as an argument. That is the same constraint
 * `product-money.ts` works under, and for the same reason: the admin form, the
 * server action, the billing cron and the tests must agree by construction, not
 * by three implementations of the same date arithmetic happening to match.
 *
 * Money here obeys the project rule without exception: every amount that gets
 * charged is agorot, integer, and travels through `money.ts`. The shekel values
 * on the boundary are form input and display only.
 *
 * The split model is unchanged from section 0.3: a recurring product bills
 * `recurring_amount_ils` per cycle and splits THAT, exactly the way a coupon
 * splits its prepayment. There is no separate subscription commission and no
 * default percent, because there is no default percent anywhere in this system.
 */

import { type Agorot, agorot, ilsToAgorot } from './money'
import { type SplitAmounts, normalizeIls, round2, splitOnSiteCharge } from './product-money'

/**
 * How often a subscription bills. Deliberately two values, not an open integer
 * of days: Cardcom tokens are charged on a calendar cadence, and "every 30 days"
 * drifts off the month it was sold on. A count multiplies the unit, so quarterly
 * is `monthly x 3` and stays anchored to the day of month.
 */
export type BillingInterval = 'monthly' | 'yearly'

export const BILLING_INTERVALS: readonly BillingInterval[] = ['monthly', 'yearly']

/** Hebrew labels for the admin form and the customer's account page. */
export const BILLING_INTERVAL_LABELS: Record<BillingInterval, string> = {
  monthly: 'חודשי',
  yearly: 'שנתי',
}

/**
 * A subscription is only ever in one of these. `past_due` is separate from
 * `canceled` on purpose: a declined card is a recoverable state, and collapsing
 * it into cancellation would silently end a paying customer's subscription on a
 * single expired-card decline.
 */
export type SubscriptionStatus = 'active' | 'past_due' | 'paused' | 'canceled'

/**
 * How many consecutive failed charges a subscription survives before the billing
 * run stops retrying it. There is no default hiding in the database for this;
 * it is a policy constant and it lives here where the tests can see it.
 */
export const MAX_CHARGE_ATTEMPTS = 3

export function isBillingInterval(value: unknown): value is BillingInterval {
  return typeof value === 'string' && (BILLING_INTERVALS as readonly string[]).includes(value)
}

/**
 * Coerces the interval multiplier. One is the only sensible floor and there is
 * no upper bound worth inventing, so anything that is not a positive integer
 * comes back null rather than being rounded into something the admin did not
 * type.
 */
export function normalizeIntervalCount(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(String(value).trim())
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 1) return null
  return parsed
}

/** Last day of a month, in UTC. February is the only interesting case. */
function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
}

/**
 * Advances an instant by whole months, clamping the day to the target month.
 *
 * A subscription sold on the 31st bills on the 28th of February and then on the
 * 31st of March again - the anchor day is preserved and only the short month is
 * clamped. Adding 30 days instead would walk the billing date backwards through
 * the year, and a customer billed on the 31st in January would be billed on the
 * 2nd of the following month by summer.
 */
function addMonthsUtc(date: Date, months: number): Date {
  const year = date.getUTCFullYear()
  const monthIndex = date.getUTCMonth()
  const anchorDay = date.getUTCDate()

  const targetMonthAbsolute = year * 12 + monthIndex + months
  const targetYear = Math.floor(targetMonthAbsolute / 12)
  const targetMonth = targetMonthAbsolute - targetYear * 12

  const day = Math.min(anchorDay, daysInMonth(targetYear, targetMonth))

  return new Date(
    Date.UTC(
      targetYear,
      targetMonth,
      day,
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds(),
    ),
  )
}

/**
 * When the cycle that starts at `fromIso` is next billed.
 *
 * Returns an ISO string so callers hand it straight to the database without a
 * timezone of their own creeping in. Throws on an unparsable input rather than
 * returning the epoch, because a subscription with a silently wrong next-charge
 * date bills a real card at a real time.
 */
export function nextChargeAt(
  fromIso: string,
  interval: BillingInterval,
  intervalCount = 1,
): string {
  const from = new Date(fromIso)
  if (Number.isNaN(from.getTime())) {
    throw new Error(`nextChargeAt: unparsable date ${JSON.stringify(fromIso)}`)
  }
  const count = normalizeIntervalCount(intervalCount)
  if (count === null) {
    throw new Error(`nextChargeAt: interval count must be a positive integer, got ${intervalCount}`)
  }

  const months = interval === 'yearly' ? 12 * count : count
  return addMonthsUtc(from, months).toISOString()
}

/**
 * The per-cycle money, split the same way every other on-site charge is split.
 *
 * The platform fee is rounded once, on the cycle total, and the supplier's share
 * is the residual. Applying both percents independently is how an agora goes
 * missing on some cycles and appears from nowhere on others - stated again here
 * because a subscription repeats the same arithmetic every month for years.
 */
export interface RecurringCycleMoney extends SplitAmounts {
  /** What the card is charged this cycle. */
  chargeAgorot: Agorot
  chargeIls: number
  platformKeepsIls: number
  supplierGetsIls: number
}

export function recurringCycleMoney(
  recurringAmountIls: number,
  platformPercent: number | string,
): RecurringCycleMoney {
  const amount = normalizeIls(recurringAmountIls)
  if (amount === null) {
    throw new Error('recurringCycleMoney: amount must be a positive shekel value')
  }

  const chargeAgorot = ilsToAgorot(amount.toFixed(2))
  const split = splitOnSiteCharge(chargeAgorot, platformPercent)

  return {
    ...split,
    chargeAgorot,
    chargeIls: amount,
    platformKeepsIls: round2(split.platformFee / 100),
    supplierGetsIls: round2(split.supplierDue / 100),
  }
}

/** What the admin sees under the recurring fields before saving them. */
export interface RecurringPreview {
  chargeIls: number
  platformKeepsIls: number
  supplierGetsIls: number
  /** Plain Hebrew for the cadence, e.g. "כל חודשיים". */
  cadenceLabel: string
  /** What the same subscription bills over twelve months, for scale. */
  annualIls: number
}

/** Cycles this cadence completes in a year. Not rounded - 5 months is 2.4. */
export function cyclesPerYear(interval: BillingInterval, intervalCount = 1): number {
  const count = normalizeIntervalCount(intervalCount) ?? 1
  return interval === 'yearly' ? 1 / count : 12 / count
}

export function cadenceLabel(interval: BillingInterval, intervalCount = 1): string {
  const count = normalizeIntervalCount(intervalCount) ?? 1
  if (interval === 'monthly') {
    if (count === 1) return 'כל חודש'
    if (count === 2) return 'כל חודשיים'
    return `כל ${count} חודשים`
  }
  if (count === 1) return 'כל שנה'
  if (count === 2) return 'כל שנתיים'
  return `כל ${count} שנים`
}

export function previewRecurringMoney(input: {
  recurringAmountIls: number
  platformPercent: number | string
  interval: BillingInterval
  intervalCount?: number
}): RecurringPreview {
  const money = recurringCycleMoney(input.recurringAmountIls, input.platformPercent)
  const count = normalizeIntervalCount(input.intervalCount) ?? 1

  return {
    chargeIls: money.chargeIls,
    platformKeepsIls: money.platformKeepsIls,
    supplierGetsIls: money.supplierGetsIls,
    cadenceLabel: cadenceLabel(input.interval, count),
    annualIls: round2(money.chargeIls * cyclesPerYear(input.interval, count)),
  }
}

/**
 * The fields a billing run needs to decide whether to charge a subscription.
 * Deliberately narrower than the database row: this module must not grow an
 * opinion about columns it does not use.
 */
export interface BillableSubscription {
  id: string
  status: SubscriptionStatus
  /** ISO instant. A run may charge it once this is in the past. */
  next_charge_at: string | null
  /** Consecutive failures. Reset to 0 by a success, never decremented. */
  failed_attempts: number
  /** Without a token there is nothing to charge; such a row is never due. */
  cardcom_token: string | null
  amount_agorot: number
}

/**
 * Which subscriptions this run may charge.
 *
 * Four independent reasons to skip, all checked rather than assumed:
 * a status that is not `active`/`past_due`, a missing or future charge date,
 * a missing token, and an attempt count already at the ceiling. A subscription
 * that fails the last one is not charged again by any later run either - it
 * needs a human or a new card, and retrying it forever would hammer a declined
 * card daily and rack up the customer's issuer fees.
 *
 * Sorted by due date so a backlog drains oldest-first and `limit` truncates the
 * newest rather than an arbitrary slice.
 */
export function dueSubscriptions<T extends BillableSubscription>(
  subscriptions: readonly T[],
  nowIso: string,
  limit = 200,
): T[] {
  const now = new Date(nowIso).getTime()
  if (Number.isNaN(now)) {
    throw new Error(`dueSubscriptions: unparsable now ${JSON.stringify(nowIso)}`)
  }

  return subscriptions
    .filter((s) => {
      if (s.status !== 'active' && s.status !== 'past_due') return false
      if (s.cardcom_token === null || s.cardcom_token === '') return false
      if (s.failed_attempts >= MAX_CHARGE_ATTEMPTS) return false
      if (s.next_charge_at === null) return false
      const due = new Date(s.next_charge_at).getTime()
      if (Number.isNaN(due)) return false
      return due <= now
    })
    .sort((a, b) => {
      const at = new Date(a.next_charge_at as string).getTime()
      const bt = new Date(b.next_charge_at as string).getTime()
      return at === bt ? a.id.localeCompare(b.id) : at - bt
    })
    .slice(0, Math.max(0, limit))
}

/**
 * The row update a charge attempt implies. Returned as data rather than written
 * here, so the decision is testable without a database and the cron stays a thin
 * caller.
 *
 * A success advances the schedule from the date that was DUE, not from now. A
 * run that fires four hours late must not push every subsequent cycle four hours
 * later; over a year of monthly billing that walks the charge date off its
 * anchor day entirely.
 */
export interface ChargeOutcomeUpdate {
  status: SubscriptionStatus
  next_charge_at: string | null
  failed_attempts: number
  last_charge_at: string | null
}

export function applyChargeOutcome(
  subscription: Pick<BillableSubscription, 'next_charge_at' | 'failed_attempts'>,
  outcome: { success: boolean },
  context: { nowIso: string; interval: BillingInterval; intervalCount?: number },
): ChargeOutcomeUpdate {
  const anchor = subscription.next_charge_at ?? context.nowIso

  if (outcome.success) {
    return {
      status: 'active',
      next_charge_at: nextChargeAt(anchor, context.interval, context.intervalCount ?? 1),
      failed_attempts: 0,
      last_charge_at: context.nowIso,
    }
  }

  const failed = subscription.failed_attempts + 1

  // A failure never cancels. The status is `past_due` on the first decline and
  // on the last one alike, and what stops the retries is the attempt count, not
  // a different status - see `isExhausted`. Auto-cancelling here would end a
  // paying customer's subscription over a card that expired on a Tuesday.
  //
  // The due date is left where it is rather than cleared, so support can still
  // see which cycle it died on and a recovered card resumes on that cycle.
  return {
    status: 'past_due',
    next_charge_at: subscription.next_charge_at,
    failed_attempts: failed,
    last_charge_at: null,
  }
}

/**
 * The subscription has spent its retries. Still `past_due`, no longer billable
 * by any run, and waiting on a human or a new card.
 */
export function isExhausted(subscription: Pick<BillableSubscription, 'failed_attempts'>): boolean {
  return subscription.failed_attempts >= MAX_CHARGE_ATTEMPTS
}

/**
 * Whether the customer may cancel this subscription from their account page.
 *
 * Cancelling an already-cancelled subscription is not an error worth showing a
 * customer, but it must not issue a second write either, so the caller checks
 * this first and the server action checks it again against the row it just read.
 */
export function canCancel(status: SubscriptionStatus): boolean {
  return status === 'active' || status === 'past_due' || status === 'paused'
}

/**
 * What the customer is told their cancellation does.
 *
 * Cancellation is never retroactive here: the cycle already paid for runs to its
 * end and no refund is implied. Saying so at the point of the click is the
 * difference between a cancellation and a disputed charge.
 */
export function cancellationNotice(paidThroughIso: string | null): string {
  if (paidThroughIso === null) return 'המנוי יבוטל מיידית ולא יבוצע חיוב נוסף.'
  const date = new Date(paidThroughIso)
  if (Number.isNaN(date.getTime())) return 'המנוי יבוטל ולא יבוצע חיוב נוסף.'
  return `לא יבוצע חיוב נוסף. המנוי פעיל עד ${date.toLocaleDateString('he-IL')}, ואין החזר על התקופה ששולמה.`
}

/**
 * The three PENDING-109 columns, read off a product row that may not have them.
 *
 * `src/types/database.ts` is generated from production and production has not
 * been migrated, so `Product` genuinely does not carry these fields - and
 * neither does the row at runtime. Casting the row to a wider type would make
 * the compiler agree with a schema that does not exist and turn a missing
 * column into `undefined` at the point of use, several frames from the cause.
 *
 * Reading defensively instead states the real situation: the fields are absent
 * until the migration lands, and every one of them comes back null until then.
 * Delete this function and use the generated type directly once PENDING-109 is
 * applied and the types are regenerated.
 */
export interface RecurringProductFields {
  amountAgorot: number | null
  interval: BillingInterval | null
  intervalCount: number | null
}

export function readRecurringProductFields(row: unknown): RecurringProductFields {
  const empty: RecurringProductFields = { amountAgorot: null, interval: null, intervalCount: null }
  if (row === null || typeof row !== 'object') return empty

  const record = row as Record<string, unknown>

  const rawAmount = record.recurring_amount_agorot
  const amountAgorot =
    typeof rawAmount === 'number' && Number.isInteger(rawAmount) && rawAmount > 0 ? rawAmount : null

  const rawInterval = record.billing_interval
  const interval = isBillingInterval(rawInterval) ? rawInterval : null

  return {
    amountAgorot,
    interval,
    intervalCount: normalizeIntervalCount(record.billing_interval_count),
  }
}

/**
 * Whether a product row is a recurring one, without assuming the enum label
 * exists. Same reasoning as above: `products.type` is typed from production,
 * where 'recurring' is not yet a member.
 */
export function isRecurringProduct(row: unknown): boolean {
  return (
    row !== null && typeof row === 'object' && (row as Record<string, unknown>).type === 'recurring'
  )
}

/** Agorot, integer, for a row that stores its own amount. */
export function subscriptionChargeAgorot(sub: Pick<BillableSubscription, 'amount_agorot'>): Agorot {
  return agorot(sub.amount_agorot)
}
