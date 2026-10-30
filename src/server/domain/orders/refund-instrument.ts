import type { VoucherState } from '@/server/domain/vouchers/state-machine'

/**
 * Which instrument a refund should go back through: the card that paid, or the
 * customer's wallet.
 *
 * THE RULE, in the order it is applied:
 *
 *   1. Value that was CONSUMED is never pulled back off the card. A voucher
 *      that was redeemed at the counter, or that expired, has already been
 *      exchanged for something (a meal, or breakage the supplier priced in).
 *      Cancelling that charge takes money back for value the customer received,
 *      which is a chargeback in everything but name. A goodwill wallet credit is
 *      the instrument for it, and `refundOrder` already refuses this case with
 *      MANUAL_RESOLUTION rather than deciding it silently.
 *
 *   2. Inside the statutory window, the money goes back the way it came.
 *      Consumer Protection Law's distance-selling window is 14 days, and a
 *      customer cancelling inside it is entitled to their money, not to store
 *      credit. This is the default and it is not negotiable by preference.
 *
 *   3. Outside it, the wallet is what remains. There is no statutory duty to
 *      refund at all past the window, so a credit is a goodwill decision the
 *      admin is making, and it stays inside the platform.
 *
 * WHAT THIS IS NOT. It is not a veto on the card path. An admin refunding a
 * duplicate charge or a defect months later must still be able to credit the
 * card, and `refundOrder` deliberately does not consult this function before
 * calling Cardcom: a trader's own error is not made un-refundable by a clock.
 * This says which instrument the case CALLS FOR, so the admin screen can
 * default to it and the recorded `ground` can match what actually happened.
 */

export type RefundInstrument = 'original_method' | 'wallet'

export const STATUTORY_WINDOW_DAYS = 14

const DAY_MS = 24 * 60 * 60 * 1000

export interface RefundInstrumentInput {
  /** When the card was charged. Absent when the charge recorded no success time. */
  chargedAt?: Date | null
  now: Date
  /** Every voucher on the order, with the state it is in right now. */
  voucherStates?: readonly VoucherState[]
}

export interface RefundInstrumentDecision {
  instrument: RefundInstrument
  /**
   * Why, as a code rather than a sentence: the admin screen renders its own
   * Hebrew and a test can assert on the reason without matching prose.
   */
  reason:
    | 'value_consumed'
    | 'within_statutory_window'
    | 'outside_statutory_window'
    | 'charge_undated'
}

/** Redeemed and expired are the two states where the value has left the platform. */
function anyConsumed(states: readonly VoucherState[]): boolean {
  return states.some((s) => s === 'redeemed' || s === 'expired')
}

export function chooseRefundInstrument(input: RefundInstrumentInput): RefundInstrumentDecision {
  if (anyConsumed(input.voucherStates ?? [])) {
    return { instrument: 'wallet', reason: 'value_consumed' }
  }

  const chargedAt = input.chargedAt
  if (!chargedAt || Number.isNaN(chargedAt.getTime())) {
    // No timestamp means the window cannot be computed, and the conservative
    // direction is the customer's: assume they are inside it. The same choice
    // `refundOrder` makes with a missing `succeeded_at`, for the same reason.
    return { instrument: 'original_method', reason: 'charge_undated' }
  }

  const elapsedMs = input.now.getTime() - chargedAt.getTime()
  if (elapsedMs <= STATUTORY_WINDOW_DAYS * DAY_MS) {
    return { instrument: 'original_method', reason: 'within_statutory_window' }
  }
  return { instrument: 'wallet', reason: 'outside_statutory_window' }
}
