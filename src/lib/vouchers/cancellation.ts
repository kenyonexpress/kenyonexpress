import { type Agorot, agorot, applyBp, bp } from '@/lib/money'

/**
 * Consumer cancellation of an unredeemed coupon (Consumer Protection Law,
 * section 14C): within 14 days of purchase, fee = min(5% of the price, 100 ILS).
 *
 * Pure arithmetic. It moves no money and reads no table; the refund itself
 * belongs to the payment path. All amounts are integer agorot via money.ts.
 */
export const CANCELLATION_WINDOW_DAYS = 14
export const CANCELLATION_FEE_BP = bp(500)
export const CANCELLATION_FEE_CAP_AGOROT = agorot(10_000)

const DAY_MS = 86_400_000

export interface CancellationQuote {
  feeAgorot: Agorot
  refundAgorot: Agorot
}

export function cancellationFee(paidAgorot: Agorot): CancellationQuote {
  const raw = applyBp(paidAgorot, CANCELLATION_FEE_BP)
  const feeAgorot = agorot(Math.min(raw, CANCELLATION_FEE_CAP_AGOROT))
  return { feeAgorot, refundAgorot: agorot(paidAgorot - feeAgorot) }
}

export function isWithinCancellationWindow(issuedAt: Date, now: Date): boolean {
  const elapsed = now.getTime() - issuedAt.getTime()
  return elapsed >= 0 && elapsed <= CANCELLATION_WINDOW_DAYS * DAY_MS
}
