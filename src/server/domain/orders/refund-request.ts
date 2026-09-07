import { type Agorot, agorot } from '@/lib/commerce/money'
import type { RefundDestination, RefundGround, RefundState } from '@/server/payments/refund-record'
import { type RefundLineInput, type RefundVoucherInput, computeCancellationFee } from './refund'
import { canTransition } from './state-machine'

/**
 * The customer's cancellation notice, and whether it needs a human.
 *
 * WHY THIS EXISTS. Migration 131 built `public.refunds` as a full adjudication
 * record -- `requested -> approved/rejected -> executing -> completed/failed`,
 * `requested_by`, `decided_by`, and a trigger forcing `refund_due_by =
 * requested_at + 14 days` because Consumer Protection Law section 14ה gives the
 * money back inside 14 days. Its own comment names the missing half:
 *
 *   "The customer may SEE their own refunds. They may not write this table
 *    directly; the cancellation control goes through a server action, because
 *    the notice timestamp has to be the server's clock, not the browser's."
 *
 * That server action was never written. MEASURED on 2026-09-08: the only writer
 * of `refunds` anywhere in `src` or `apps` is `recordRefund`, which is called
 * AFTER an admin has already credited the card and writes a terminal
 * `completed` row. Every one of `requested`, `approved` and `rejected` was
 * unreachable, `requested_by` was always NULL, and the statutory clock started
 * when an operator got round to it rather than when the customer pressed
 * cancel. This module is the decision that action needs.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It never moves money and never authorises
 * moving money. `autoApproved` writes `state = 'approved'` and nothing else;
 * the card credit stays behind `refundOrder`, which requires
 * `requireAdminSession`. Auto-approval buys the two things worth buying -- the
 * statutory clock starts at the customer's click, and the adjudication is
 * already made when the operator opens the queue -- without putting a card
 * credit on the far side of a customer button. This project has twice shipped a
 * money path that looked alive and was not; it should not now ship one that is
 * more alive than intended.
 */

/** Section 14ה. Days, from the transaction. Statutory, not a business setting. */
export const STATUTORY_CANCELLATION_WINDOW_DAYS = 14

/**
 * How many cancellations one customer may have decided by machine.
 *
 * NOT a cap on refunds. A customer whose fourth request arrives is not refused
 * -- their request is recorded as `requested` and a person reads it. The cap is
 * on the ABSENCE of a person, which is the only thing automation can safely
 * ration: the fraud shape this guards against is one account cancelling
 * repeatedly, and it is a shape a human should look at, not one the customer
 * should be silently denied their statutory right over.
 */
export const AUTO_APPROVAL_LIMIT = 3

/**
 * The window the limit counts over. A year rather than "ever", so a customer
 * with three legitimate cancellations in 2024 is not funnelled through manual
 * review for the rest of their life.
 */
export const AUTO_APPROVAL_WINDOW_DAYS = 365

const MS_PER_DAY = 86_400_000

/** Structural refusals. A refusal is never "we decided no" -- that is a `rejected` row. */
export type RefundRequestRefusalCode =
  | 'NOT_FOUND'
  | 'NOT_YOURS'
  | 'NOT_PAID'
  | 'ALREADY_OPEN'
  | 'NOTHING_REFUNDABLE'

/** Why a machine declined to decide, so the operator knows what to look at. */
export type ManualReviewReason =
  | 'window_closed'
  | 'auto_approval_limit_reached'
  | 'value_consumed'
  | 'supplier_paid'
  | 'unverifiable_claim'

export interface RefundRequestInput {
  /** What the card was actually charged for this order, in agorot. */
  cardChargedAgorot: number
  /** When the charge succeeded. Undefined reads as "cannot date it" -- manual. */
  paidAt?: Date
  lines: RefundLineInput[]
  vouchers: RefundVoucherInput[]
  /**
   * What the customer says happened. `defect` zeroes the fee by statute, which
   * is exactly why it is never auto-approved: it is a claim about a fact the
   * server cannot see.
   */
  ground: RefundGround
  /** Refunds already decided by machine for THIS customer inside the window. */
  priorAutoApprovals: readonly { decidedAt: Date }[]
  now: Date
}

export interface RefundRequestDecision {
  /** The row to write. Only ever `requested` or `approved` -- never a rejection. */
  state: Extract<RefundState, 'requested' | 'approved'>
  ground: RefundGround
  destination: RefundDestination
  /** What is being cancelled, NOT what is handed back. 131's column means this. */
  requestedAgorot: Agorot
  cancellationFeeAgorot: Agorot
  autoApproved: boolean
  /** Empty when auto-approved. Ordered most-specific first. */
  manualReviewReasons: ManualReviewReason[]
  /** Hebrew, shown to the customer as-is. */
  messageHe: string
}

export class RefundRequestRefusal extends Error {
  readonly code: RefundRequestRefusalCode
  readonly messageHe: string
  constructor(code: RefundRequestRefusalCode, messageHe: string) {
    super(`refund request refused: ${code}`)
    this.name = 'RefundRequestRefusal'
    this.code = code
    this.messageHe = messageHe
  }
}

/**
 * Is the notice inside the statutory window.
 *
 * MEASURED FROM PAYMENT, AND THAT IS NOT WHAT THE STATUTE SAYS FOR GOODS. For a
 * physical product the 14 days run from receipt, which is later than payment;
 * for a service or a coupon they run from the transaction. `public.orders`
 * carries `paid_at` and has no delivery timestamp at all (checked column by
 * column, 2026-09-08), so the only date available here is the earlier one, and
 * measuring from it closes the window EARLY for goods.
 *
 * Which is why a closed window is not a refusal anywhere in this module. It
 * demotes the request to `requested` and a person reads it. Refusing a
 * statutory claim on a date we do not hold would be the one error here with a
 * legal cost, and the conservative direction is obvious.
 */
export function isInsideStatutoryWindow(paidAt: Date, now: Date): boolean {
  const elapsedDays = (now.getTime() - paidAt.getTime()) / MS_PER_DAY
  return elapsedDays >= 0 && elapsedDays <= STATUTORY_CANCELLATION_WINDOW_DAYS
}

/**
 * Where the money goes back to.
 *
 * A STATUTORY REFUND CANNOT BE PAID IN STORE CREDIT. Section 14ה obliges the
 * return of the money paid; a wallet balance is not money, it is a promise
 * redeemable only here, and discharging the obligation with one would not
 * discharge it. So every ground that names a legal right -- the 14-day
 * cancellation, a defect, a service never delivered, a charge taken twice --
 * returns to the card.
 *
 * `goodwill` and `extended_window` are the two that are ours to give: nothing
 * obliges them, they exist because we chose to say yes outside the rules, and
 * the wallet is the natural instrument for a concession. That asymmetry is the
 * whole rule, and it is a legal one rather than a preference, so it lives here
 * and not in a settings table.
 */
export function refundDestinationFor(ground: RefundGround): RefundDestination {
  switch (ground) {
    case 'goodwill':
    case 'extended_window':
      return 'wallet'
    default:
      return 'original_method'
  }
}

function countRecentAutoApprovals(
  priorAutoApprovals: readonly { decidedAt: Date }[],
  now: Date,
): number {
  const cutoff = now.getTime() - AUTO_APPROVAL_WINDOW_DAYS * MS_PER_DAY
  return priorAutoApprovals.filter((r) => r.decidedAt.getTime() >= cutoff).length
}

/**
 * Decide the customer's cancellation notice.
 *
 * Throws `RefundRequestRefusal` only for the structural cases -- an order that
 * was never paid, an order with no line a refund could touch. Everything else
 * returns a row: either decided by machine, or `requested` with the reasons a
 * person needs. Refusing is not adjudicating, and this function never
 * adjudicates against the customer.
 */
export function decideRefundRequest(input: RefundRequestInput): RefundRequestDecision {
  const refundableLines = input.lines.filter(
    (line) =>
      line.settlementStatus !== 'refunded' &&
      line.settlementStatus !== 'cancelled' &&
      canTransition(line.settlementStatus, 'REFUND'),
  )
  if (refundableLines.length === 0) {
    throw new RefundRequestRefusal(
      'NOTHING_REFUNDABLE',
      'אין בהזמנה הזו פריטים שניתן לבטל. אם נפלה טעות, אפשר לפנות לשירות הלקוחות.',
    )
  }

  const reasons: ManualReviewReason[] = []

  // Value that left the platform. A redeemed voucher was spent at the counter
  // and an expired one lapsed as breakage; either way the card money is no
  // longer ours to pull back, and `planOrderRefund` will throw NOT_REFUNDABLE
  // on both. Auto-approving a decision the executor is guaranteed to refuse
  // would hand the customer an "approved" they can never be paid.
  const consumed = input.vouchers.filter((v) => v.status === 'redeemed' || v.status === 'expired')
  if (consumed.length > 0) reasons.push('value_consumed')

  // The supplier already has their share. Recovering it is a payout adjustment
  // against a business relationship, which is a person's call.
  const released = refundableLines.some((line) => (line.supplierReleasedAgorot ?? 0) > 0)
  if (released) reasons.push('supplier_paid')

  // A claim about the world rather than about our records. `defect` and
  // `service_not_provided` are both assertions the server cannot check, and
  // both zero or reshape the fee, so both go to a person. `duplicate_charge` is
  // checkable but the check is against the clearing file, not this table.
  if (input.ground !== 'distance_sale_14d') reasons.push('unverifiable_claim')

  if (!input.paidAt || !isInsideStatutoryWindow(input.paidAt, input.now)) {
    reasons.push('window_closed')
  }

  if (countRecentAutoApprovals(input.priorAutoApprovals, input.now) >= AUTO_APPROVAL_LIMIT) {
    reasons.push('auto_approval_limit_reached')
  }

  const requestedAgorot = agorot(Math.max(0, Math.trunc(input.cardChargedAgorot)))
  const cancellationFeeAgorot = computeCancellationFee(
    requestedAgorot,
    input.ground === 'defect' || input.ground === 'duplicate_charge',
  )

  const autoApproved = reasons.length === 0

  return {
    state: autoApproved ? 'approved' : 'requested',
    ground: input.ground,
    destination: refundDestinationFor(input.ground),
    requestedAgorot,
    cancellationFeeAgorot,
    autoApproved,
    manualReviewReasons: reasons,
    messageHe: autoApproved
      ? 'בקשת הביטול אושרה. הזיכוי יוחזר לאמצעי התשלום המקורי תוך 14 ימים.'
      : 'בקשת הביטול התקבלה ונמצאת בבדיקה. נחזור אליך עם תשובה תוך 14 ימים.',
  }
}
