import { type Agorot, agorot, sumAgorot } from '@/lib/money'

/**
 * The wallet ledger reason of the debit written when a request is marked
 * paid. Labelled in `server/queries/account.ts` next to `affiliate_commission`.
 * Lives here and not in the action file because a 'use server' module may
 * export only async functions.
 */
export const AFFILIATE_PAYOUT_REASON = 'affiliate_payout'

/**
 * How much an affiliate may ask to be paid out right now, integer agorot.
 *
 * THREE CEILINGS, THE LOWEST WINS, NEVER BELOW ZERO.
 *
 *   paid commissions      what `affiliate_conversions` at status `paid` add
 *                         up to: money the programme has credited.
 *   minus earlier asks    every request that is `pending` or `paid` already
 *                         covers part of that sum. A rejected one covers
 *                         nothing and the amount is askable again.
 *   wallet balance        the commission is wallet credit the affiliate may
 *                         have already spent in the shop. Cash for credit
 *                         that is gone would be paying twice.
 *
 * Pure, so the number on the account page and the number the action writes
 * are the same function over the same inputs. No float: every input is an
 * `Agorot` and the only arithmetic is integer subtraction.
 */
export interface PayoutInputs {
  paidCommissionAgorot: Agorot
  /** Amounts of requests at `pending` or `paid`. Rejected ones are excluded by the caller. */
  coveredByRequestsAgorot: readonly Agorot[]
  walletBalanceAgorot: Agorot
}

export function requestablePayoutAgorot(input: PayoutInputs): Agorot {
  const covered = sumAgorot(input.coveredByRequestsAgorot)
  const uncovered = input.paidCommissionAgorot - covered
  const capped = Math.min(uncovered, input.walletBalanceAgorot)
  return agorot(Math.max(0, capped))
}

export type PayoutRequestStatus = 'pending' | 'paid' | 'rejected'

const STATUSES: ReadonlySet<string> = new Set(['pending', 'paid', 'rejected'])

export function payoutRequestStatus(value: unknown): PayoutRequestStatus {
  return (STATUSES.has(String(value)) ? value : 'pending') as PayoutRequestStatus
}

/** A request at these statuses covers part of the paid commissions. */
export function requestCovers(status: PayoutRequestStatus): boolean {
  return status === 'pending' || status === 'paid'
}
