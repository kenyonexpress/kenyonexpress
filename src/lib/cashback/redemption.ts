import { type Agorot, agorot } from '@/lib/money'

/**
 * What the checkout may take out of the cashback wallet (STEP 13).
 *
 * Three ceilings and one floor, all integer agorot through `money.ts`:
 *
 *  - never more than the wallet balance (the server re-reads it, this module
 *    only mirrors the answer for the form);
 *  - never more than the on-site charge, because wallet money cannot go
 *    towards the part of a coupon collected at the business;
 *  - never a partial redemption under ₪10. A wallet that holds less than the
 *    floor, or a cart that costs less than it, simply cannot redeem, and the
 *    form says so instead of offering a box that the server will refuse.
 *
 * The database decides what goes INTO the wallet (`fn_cashback_order_bonus`,
 * 177, and the per-item snapshot finalize credits); this module decides
 * nothing about earning, only about what may come out at checkout.
 */

/** The smallest redemption the checkout accepts: ₪10, as integer agorot. */
export const MIN_WALLET_REDEMPTION_AGOROT: Agorot = agorot(1000)

/** The same floor in shekels, for the input's `min` attribute and its label. */
export const MIN_WALLET_REDEMPTION_ILS = 10

export type RedemptionRefusal = 'BELOW_MINIMUM' | 'INSUFFICIENT_BALANCE' | 'EXCEEDS_CHARGE'

export type RedemptionVerdict =
  | { ok: true; agorot: Agorot }
  | { ok: false; code: RedemptionRefusal }

function assertAgorot(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be non-negative integer agorot (got ${value})`)
  }
}

/**
 * The most the wallet can pay towards this order: min(balance, charge), or
 * zero when that number sits under the floor. Zero means "no wallet box".
 */
export function redeemableCeilingAgorot(balanceAgorot: Agorot, chargeAgorot: Agorot): Agorot {
  assertAgorot(balanceAgorot, 'balance')
  assertAgorot(chargeAgorot, 'charge')
  const ceiling = Math.min(balanceAgorot, chargeAgorot)
  return ceiling >= MIN_WALLET_REDEMPTION_AGOROT ? agorot(ceiling) : agorot(0)
}

/** Whether a redemption of any size is possible against this balance and charge. */
export function canRedeemWallet(balanceAgorot: Agorot, chargeAgorot: Agorot): boolean {
  return redeemableCeilingAgorot(balanceAgorot, chargeAgorot) > 0
}

/**
 * The server's verdict on a requested redemption. Zero is "no wallet", which
 * is always fine; anything positive has to clear the floor, the balance and
 * the on-site charge, in that order, so the shopper hears the reason that is
 * theirs to fix first.
 */
export function checkWalletRedemption(
  requestedAgorot: Agorot,
  balanceAgorot: Agorot,
  chargeAgorot: Agorot,
): RedemptionVerdict {
  assertAgorot(requestedAgorot, 'requested')
  assertAgorot(balanceAgorot, 'balance')
  assertAgorot(chargeAgorot, 'charge')
  if (requestedAgorot === 0) return { ok: true, agorot: agorot(0) }
  if (requestedAgorot < MIN_WALLET_REDEMPTION_AGOROT) return { ok: false, code: 'BELOW_MINIMUM' }
  if (requestedAgorot > balanceAgorot) return { ok: false, code: 'INSUFFICIENT_BALANCE' }
  if (requestedAgorot > chargeAgorot) return { ok: false, code: 'EXCEEDS_CHARGE' }
  return { ok: true, agorot: agorot(requestedAgorot) }
}

/** The Hebrew the checkout shows for a refusal. */
export const REDEMPTION_REFUSAL_MESSAGES: Record<RedemptionRefusal, string> = {
  BELOW_MINIMUM: `מימוש מהארנק אפשרי מסכום של ₪${MIN_WALLET_REDEMPTION_ILS} ומעלה`,
  INSUFFICIENT_BALANCE: 'יתרת הארנק אינה מספיקה',
  EXCEEDS_CHARGE: 'סכום הארנק גבוה מהסכום לתשלום באתר',
}
