import { agorot } from '@/lib/money'
import { shekels } from '@/lib/money-format'

/**
 * What a customer is told about the money behind a coupon that expired.
 *
 * =========================================================================
 * WHY THE PAGE SAID NOTHING, AND WHY THAT IS THE WORST OF THE THREE STATES
 * =========================================================================
 *
 * C6: expiry is not forfeiture. `credit_expired_vouchers()` puts what the
 * customer paid online back into their wallet on the night after the sweep, and
 * it has done so since 088. Measured 2026-09-10: nothing on `/coupon/[id]` or
 * `/account/coupons` mentions it, and no notification is enqueued for it (227
 * adds the notification; this file is the page's half).
 *
 * So a customer whose coupon lapsed saw a grey chip reading `פג תוקף` and a dead
 * code. That page is indistinguishable from forfeiture, which is the policy the
 * project deliberately does not have. The money was already theirs and the only
 * surface they would look at did not say so.
 *
 * =========================================================================
 * THREE STATES, AND THE MIDDLE ONE IS THE POINT
 * =========================================================================
 *
 * The sweep and the credit are two separate steps of one nightly job, in that
 * order, and the route's own header explains why they are never merged: step 1
 * moves no money and step 2 does. A voucher therefore sits `expired` and
 * uncredited for as long as it takes step 2 to reach it -- normally minutes,
 * longer whenever the backlog exceeds the 500-per-run cap.
 *
 *   'credited' the wallet entry exists. Name the amount and the date.
 *   'pending'  expired, money owed, not yet moved. Say it is coming.
 *   'none'     nothing is owed, because nothing was paid online.
 *
 * Collapsing 'pending' into 'credited' would promise money that is not there
 * yet, and collapsing it into 'none' would tell a customer they are owed
 * nothing on the one night they are owed the most. It gets its own sentence.
 *
 * =========================================================================
 * WHAT DOES NOT GET A REFUND LINE
 * =========================================================================
 *
 * Only `expired`. A `refunded` voucher was credited to the CARD by a different
 * path and the coupon page already says so; `cancelled` is an order that never
 * completed; `redeemed` was used. Printing a wallet-refund sentence on any of
 * them describes a second, imaginary sum of money.
 *
 * `coupon_price_agorot` of zero is 'none' rather than a ₪0 refund line, on the
 * same reasoning `buildRefundCompletedEmail` gives for hiding a zero fee: a
 * printed zero reads as though something nearly happened.
 */

export type ExpiryRefundState = 'none' | 'pending' | 'credited'

export interface ExpiryRefundSnapshot {
  status: string
  /** Integer agorot the customer paid online for this voucher. */
  coupon_price_agorot: number
  /**
   * The `voucher:<id>:expiry_credit` wallet entry, when it exists. Integer
   * agorot, read from the generated `amount_ils_agorot` column so no float ever
   * enters the money path.
   */
  credit: { amountAgorot: number; createdAt: string } | null
}

export interface ExpiryRefundView {
  state: ExpiryRefundState
  /** Ready to print. Empty when `state` is 'none'. */
  headline: string
  detail: string
  /** Integer agorot, for a caller that wants the number rather than the words. */
  amountAgorot: number
}

/**
 * The amount is read from the LEDGER when the ledger has spoken, and from the
 * voucher only while it has not.
 *
 * They should be equal and the difference matters when they are not: the
 * voucher says what is owed and the wallet entry says what was actually paid.
 * A customer reading a credited coupon must see the sum that reached them, so a
 * partial or adjusted credit is visible rather than papered over by the figure
 * the page would have preferred.
 */
export function expiryRefundView(voucher: ExpiryRefundSnapshot): ExpiryRefundView {
  const empty: ExpiryRefundView = { state: 'none', headline: '', detail: '', amountAgorot: 0 }

  if (voucher.status !== 'expired') return empty

  const owed = Math.trunc(voucher.coupon_price_agorot)
  if (!Number.isFinite(owed) || owed <= 0) return empty

  if (voucher.credit) {
    const paid = Math.trunc(voucher.credit.amountAgorot)
    return {
      state: 'credited',
      headline: `${shekels(agorot(paid))} הוחזרו לארנק שלך`,
      detail: 'התוקף נגמר, אבל הסכום ששולם באתר לא הולך לאיבוד. אפשר להשתמש בו בקנייה הבאה.',
      amountAgorot: paid,
    }
  }

  return {
    state: 'pending',
    headline: `${shekels(agorot(owed))} יוחזרו לארנק שלך`,
    detail: 'הזיכוי מתבצע אוטומטית תוך יממה מרגע פקיעת התוקף ויופיע בעמוד הארנק.',
    amountAgorot: owed,
  }
}

/** The idempotency key `credit_expired_vouchers()` writes. One spelling, here. */
export function expiryCreditKey(voucherId: string): string {
  return `voucher:${voucherId}:expiry_credit`
}
