/**
 * What the coupon page says about time, derived once.
 *
 * Two different clocks meet on a coupon page and the copy used to blur them:
 *
 *   - `offer_valid_until` is the deadline of the OFFER. After it the product
 *     cannot be bought at all (`buildCouponOffer` marks it expired).
 *   - `coupon_expiry_days` is the life of the VOUCHER once issued, counted
 *     from the purchase, not from today.
 *
 * Israeli consumer law limits urgency claims to ones the seller can
 * substantiate, which is why every number here traces to a column and the
 * output is null, not "hurry", when neither is set.
 */

export type CouponExpiryUrgency = 'none' | 'soon' | 'today'

export interface CouponExpiry {
  /** Whole days until the offer closes, floored at 0. Null with no deadline. */
  daysLeft: number | null
  /** "בתוקף עד 3 באוקטובר 2026" when a deadline exists. */
  deadlineLabel: string | null
  /** "נותרו 3 ימים" / "היום האחרון" / null. Only from a real deadline. */
  countdownLabel: string | null
  urgency: CouponExpiryUrgency
  /** "השובר תקף 30 ימים מרגע הרכישה" when the voucher life is capped. */
  voucherLabel: string | null
}

const DAY_MS = 86_400_000

export function describeCouponExpiry(input: {
  validUntil: Date | null
  expiryDays: number | null
  now?: Date
}): CouponExpiry {
  const now = input.now ?? new Date()
  const validUntil = input.validUntil

  let daysLeft: number | null = null
  let deadlineLabel: string | null = null
  let countdownLabel: string | null = null
  let urgency: CouponExpiryUrgency = 'none'

  if (validUntil && !Number.isNaN(validUntil.getTime())) {
    const remainingMs = validUntil.getTime() - now.getTime()
    daysLeft = Math.max(0, Math.floor(remainingMs / DAY_MS))
    deadlineLabel = `בתוקף עד ${validUntil.toLocaleDateString('he-IL', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })}`
    if (remainingMs <= 0) {
      countdownLabel = 'המבצע הסתיים'
      urgency = 'today'
    } else if (daysLeft === 0) {
      countdownLabel = 'היום האחרון למבצע'
      urgency = 'today'
    } else if (daysLeft === 1) {
      countdownLabel = 'נותר יום אחד למבצע'
      urgency = 'soon'
    } else if (daysLeft <= 7) {
      countdownLabel = `נותרו ${daysLeft} ימים למבצע`
      urgency = 'soon'
    } else {
      countdownLabel = `נותרו ${daysLeft} ימים למבצע`
    }
  }

  const expiryDays =
    input.expiryDays != null && Number.isFinite(input.expiryDays) && input.expiryDays > 0
      ? Math.floor(input.expiryDays)
      : null
  const voucherLabel =
    expiryDays === null
      ? null
      : expiryDays === 1
        ? 'השובר תקף יום אחד מרגע הרכישה'
        : `השובר תקף ${expiryDays} ימים מרגע הרכישה`

  return { daysLeft, deadlineLabel, countdownLabel, urgency, voucherLabel }
}
