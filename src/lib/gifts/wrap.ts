import { type Agorot, agorot } from '@/lib/commerce/money'

/**
 * The two things a gift can carry beyond a greeting: a wrapping fee, and a date
 * to arrive on.
 *
 * Pure, and deliberately so. Both values arrive from a checkout form, which is
 * to say from a browser, and both then reach the card charge and the outbox.
 * Everything that decides what they may be is in this file, so that the
 * checkout action, the schema and the tests all read the same rules rather than
 * three copies that have to agree.
 */

/**
 * ₪15, as an integer number of agorot.
 *
 * A CONSTANT AND NOT A SETTINGS ROW, and that is a measured decision rather
 * than a shortcut: there is no settings table in this database. Grepping for
 * one finds `referral_program_settings` and nothing else, so "make it
 * configurable" means inventing a table, a read path, a cache and an admin
 * screen for a single scalar - and until that screen exists an operator cannot
 * change it either way. The order snapshots what it charged
 * (`orders.gift_wrap_fee_agorot`), so raising this number later does not
 * rewrite a single order that has already been placed, which is the property
 * that actually matters.
 */
export const GIFT_WRAP_FEE_AGOROT: Agorot = agorot(1500)

/**
 * How far ahead a gift may be scheduled.
 *
 * A year, because the reason to schedule at all is a birthday or a holiday, and
 * both are at most a year out. The ceiling is not politeness: a coupon has an
 * `expires_at`, and a send date past it would deliver a claim link for
 * something that cannot be claimed. That specific check needs the voucher and
 * so lives at the point of sending; this one refuses the absurd before it ever
 * reaches an order.
 */
export const MAX_GIFT_SCHEDULE_DAYS = 365

/**
 * The slack allowed on "not in the past".
 *
 * A date input yields a local midnight, the server compares in UTC, and Israel
 * is two or three hours ahead of it depending on the season. Without slack, a
 * customer choosing TODAY in Tel Aviv at 09:00 submits 00:00 local, which is
 * 21:00 or 22:00 the previous day in UTC, and the form tells them their date is
 * in the past. One day of tolerance absorbs every offset on earth, and the
 * cost of being wrong in this direction is a gift that goes out on the next
 * drain run instead of being refused.
 */
const PAST_TOLERANCE_MS = 24 * 60 * 60 * 1000

export type GiftScheduleResult = { ok: true; deliverAt: Date | null } | { ok: false; error: string }

/**
 * Turns whatever the form sent into a send-at, or a Hebrew refusal.
 *
 * Empty, absent and whitespace all mean "now", which is what every gift did
 * before this existed and remains the default. A value that is not a date at
 * all is refused rather than silently treated as now: a customer who typed a
 * date and got an immediate send has been ignored, not defaulted.
 */
export function resolveGiftDeliverAt(
  value: string | null | undefined,
  now: Date = new Date(),
): GiftScheduleResult {
  const raw = (value ?? '').trim()
  if (!raw) return { ok: true, deliverAt: null }

  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) {
    return { ok: false, error: 'תאריך המשלוח אינו תקין' }
  }

  if (parsed.getTime() < now.getTime() - PAST_TOLERANCE_MS) {
    return { ok: false, error: 'לא ניתן לתזמן משלוח לתאריך שעבר' }
  }

  const ceiling = now.getTime() + MAX_GIFT_SCHEDULE_DAYS * 24 * 60 * 60 * 1000
  if (parsed.getTime() > ceiling) {
    return { ok: false, error: `ניתן לתזמן משלוח עד ${MAX_GIFT_SCHEDULE_DAYS} ימים קדימה` }
  }

  // A date that has already passed within the tolerance window means "now".
  // Handing it back unchanged would park an outbox row on a `next_attempt_at`
  // in the past, which the drain treats as due - the same outcome by accident
  // rather than on purpose.
  if (parsed.getTime() <= now.getTime()) return { ok: true, deliverAt: null }

  return { ok: true, deliverAt: parsed }
}

/**
 * The `min` and `max` a `<input type="date">` should carry, as `yyyy-mm-dd`.
 *
 * Derived from the same ceiling the server enforces, so the picker cannot offer
 * a date the action will refuse. The server check remains the boundary - a date
 * input is a suggestion to a browser, and this one is posted to a server action
 * that anything can call.
 *
 * LOCAL COMPONENTS, NOT `toISOString().slice(0, 10)`. A date input is read and
 * written in the user's own calendar day; the ISO form is UTC, and in Israel
 * that is the previous day for the first two or three hours after midnight. The
 * naive version would offer a shopper at 00:30 a `min` of yesterday.
 */
export function giftDateInputBounds(now: Date = new Date()): { min: string; max: string } {
  const asDay = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const max = new Date(now)
  max.setDate(max.getDate() + MAX_GIFT_SCHEDULE_DAYS)
  return { min: asDay(now), max: asDay(max) }
}

/**
 * What the wrapping fee costs on this order.
 *
 * Charged once per ORDER and not per coupon. A gift order is one parcel for one
 * person - that is the same assumption `gift_recipient_email` is built on, one
 * recipient per order - and charging ₪15 four times for four coupons going into
 * one envelope would be a fee for something that is not being done.
 *
 * `columnAvailable` is not a feature flag. 226 is a PENDING migration, and
 * `orders.gift_wrap_fee_agorot` may not exist on the database this runs
 * against. Charging a fee that cannot be recorded is the one outcome worth
 * refusing outright: the customer's card would be ₪15 lighter and no row in the
 * system would say why, which is unanswerable at the point where somebody asks
 * for it back. Absent column means no fee, and the checkbox does nothing.
 */
export function giftWrapFeeAgorot(input: {
  requested: boolean
  isGift: boolean
  columnAvailable: boolean
}): Agorot {
  if (!input.requested || !input.isGift || !input.columnAvailable) return agorot(0)
  return GIFT_WRAP_FEE_AGOROT
}
