import { agorot } from '@/lib/money'
import { shekels } from '@/lib/money-format'
/**
 * Presentation rules for the two screens a voucher is actually used on: the
 * customer's coupon page (/coupon/[id]) and the counter's scan screen (/scan).
 *
 * Pure and client-safe on purpose. `server/domain/vouchers/code.ts` imports
 * node:crypto, so a client component that only wants to group a code into
 * XXXXX-XXXXX cannot import it; the formatting lives here and `code.ts`
 * re-exports it, so there is still exactly one implementation.
 *
 * Two rules in here are not cosmetic:
 *
 *   1. `expires_at` is the deadline, never `offer_valid_until`. The DB CHECK
 *      vouchers_expires_within_offer and computeVoucherExpiry both make
 *      expires_at = min(rolling window, offer end), so showing the offer end to
 *      a customer can promise a date the voucher will not survive to, and they
 *      find that out standing at the counter.
 *
 *   2. A stored status of `issued` is not the same as usable. The expiry sweep
 *      is a cron (088), so a voucher sits at `issued` between its deadline and
 *      the next run. Both screens must answer from the clock, not the column.
 */

export type CouponStatus = 'issued' | 'redeemed' | 'expired' | 'cancelled' | 'refunded'

export const COUPON_STATUS_LABELS: Record<CouponStatus, string> = {
  issued: 'פעיל',
  redeemed: 'מומש',
  expired: 'פג תוקף',
  cancelled: 'בוטל',
  refunded: 'הוחזר',
}

export type CouponTone = 'live' | 'used' | 'lapsed' | 'void'

export const COUPON_TONE_CLASS: Record<CouponTone, string> = {
  live: 'bg-green-100 text-green-700',
  used: 'bg-gray-200 text-gray-600',
  lapsed: 'bg-amber-100 text-amber-700',
  void: 'bg-red-100 text-red-700',
}

/**
 * The same four tones in the account shell's vocabulary (`account-chip--*`).
 *
 * It lives here rather than in `lib/account/format.ts` so a screen inside the
 * account area and a screen outside it cannot end up with two different ideas
 * of what a status means. `lapsed` reads `dead` and not `warn`: a coupon past
 * its deadline is refused at the counter, and a chip that looks like a warning
 * suggests it is still worth a trip.
 */
export const COUPON_TONE_CHIP: Record<CouponTone, 'ok' | 'warn' | 'dead'> = {
  live: 'ok',
  used: 'warn',
  lapsed: 'dead',
  void: 'dead',
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

export interface CouponSnapshot {
  status: string
  /** Effective deadline, ISO. */
  expires_at: string
  redeemed_at?: string | null
}

function deadline(voucher: CouponSnapshot): number | null {
  const t = new Date(voucher.expires_at).getTime()
  return Number.isNaN(t) ? null : t
}

/**
 * Whether the code and QR are worth putting on screen.
 *
 * An unparseable deadline reads as NOT presentable. That is the safe direction:
 * a QR shown next to a voucher the counter will refuse wastes a customer's trip,
 * while a hidden QR on a live voucher is recoverable by support reading the code.
 */
export function isCouponPresentable(voucher: CouponSnapshot, now: Date = new Date()): boolean {
  if (voucher.status !== 'issued') return false
  const at = deadline(voucher)
  if (at === null) return false
  return at > now.getTime()
}

/** Stored as issued, past its deadline: the sweep has not caught up yet. */
export function isCouponLapsedUnswept(voucher: CouponSnapshot, now: Date = new Date()): boolean {
  if (voucher.status !== 'issued') return false
  const at = deadline(voucher)
  if (at === null) return false
  return at <= now.getTime()
}

export interface CouponStatusView {
  /** What the customer is told. Reads `פג תוקף` for a lapsed-but-unswept row. */
  label: string
  tone: CouponTone
  presentable: boolean
  /** Whole days left, floored, 0 on the last day. Null once it cannot be used. */
  daysLeft: number | null
  /** True in the last 3 days, so the page can say so loudly. */
  expiringSoon: boolean
}

export function couponStatusView(
  voucher: CouponSnapshot,
  now: Date = new Date(),
): CouponStatusView {
  const presentable = isCouponPresentable(voucher, now)

  if (presentable) {
    const at = deadline(voucher) as number
    const daysLeft = Math.max(0, Math.floor((at - now.getTime()) / MS_PER_DAY))
    return {
      label: COUPON_STATUS_LABELS.issued,
      tone: 'live',
      presentable: true,
      daysLeft,
      expiringSoon: daysLeft <= 3,
    }
  }

  // A row still marked issued has either lapsed or carries a broken deadline.
  // Both are shown as expired rather than as active: the counter will refuse
  // them, and the screen must not disagree with the counter.
  const status = (voucher.status === 'issued' ? 'expired' : voucher.status) as CouponStatus

  const tone: CouponTone = status === 'redeemed' ? 'used' : status === 'expired' ? 'lapsed' : 'void'

  return {
    label: COUPON_STATUS_LABELS[status] ?? COUPON_STATUS_LABELS.expired,
    tone,
    presentable: false,
    daysLeft: null,
    expiringSoon: false,
  }
}

export interface CouponMoneySnapshot {
  face_value_agorot: number
  coupon_price_agorot: number
  remaining_amount_due_agorot: number
}

export interface CouponMoneyView {
  faceValueAgorot: number
  paidOnlineAgorot: number
  dueAtBusinessAgorot: number
  /** face == paid + due. False means the snapshot is corrupt. */
  conserved: boolean
}

/**
 * The three numbers both screens show, with conservation checked rather than
 * assumed.
 *
 * `amountToCollect` in domain/vouchers/redemption.ts throws on a violation,
 * which is right on the redemption path. This is a display path on a page a
 * customer opens; a 500 there tells them their coupon is gone. So the stored
 * balance is returned as-is with `conserved: false`, and the caller shows the
 * discrepancy instead of a number it made up.
 */
export function couponMoneyView(voucher: CouponMoneySnapshot): CouponMoneyView {
  const faceValueAgorot = voucher.face_value_agorot
  const paidOnlineAgorot = voucher.coupon_price_agorot
  const dueAtBusinessAgorot = voucher.remaining_amount_due_agorot
  return {
    faceValueAgorot,
    paidOnlineAgorot,
    dueAtBusinessAgorot,
    conserved: paidOnlineAgorot + dueAtBusinessAgorot === faceValueAgorot,
  }
}

/** `XXXXX-XXXXX` for reading aloud at a counter. Never persisted. */
export function formatCouponCode(code: string): string {
  const clean = code.replace(/[^0-9A-Za-z]/g, '').toUpperCase()
  const groups: string[] = []
  for (let i = 0; i < clean.length; i += 5) groups.push(clean.slice(i, i + 5))
  return groups.join('-')
}

/**
 * The money formatter for the whole coupon-after-payment surface: the coupon
 * page, the supplier scan screen, the account list, the voucher email, the
 * notifications and the wallet pass all print through this one function.
 *
 * It divided by 100 and handed the resulting float to `toLocaleString`. That is
 * the pattern `pricing.test.ts` was written to keep out of the money path, and
 * `shekels` already does it by integer division -- whole shekels and the agora
 * remainder separated with `/` and `%`, so no value is ever a float even for
 * the length of a format call. Delegating keeps this function's own contract,
 * which `shekels` does not have and which the callers rely on: a missing or
 * non-finite amount is a DASH and never `₪0.00`, because "you owe nothing" and
 * "we do not know what you owe" are different things to read at a till.
 */
export function formatAgorot(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return shekels(agorot(Math.trunc(value)))
}

export function formatCouponDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })
}
