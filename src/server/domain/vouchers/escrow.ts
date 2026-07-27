import { type Agorot, agorot, sumAgorot } from '@/lib/commerce/money'

/**
 * The supplier's share of a coupon prepayment, held per voucher until the
 * voucher is redeemed (CONTRADICTIONS C11 version b, decided 2026-07-27).
 *
 * One hold per voucher rather than per order line, because units of the same
 * line are redeemed one at a time: buying three vouchers and using one must
 * release exactly one supplier share, not all three and not none.
 *
 * The hold is an internal record in our own ledger (C3). No third party holds
 * the money, there is no J5 transaction, and nothing is frozen on the
 * customer's card. `redeem_voucher()` (migration 074) closes it in the same
 * transaction that flips the voucher, so a released hold without a redeemed
 * voucher is unreachable.
 */

export interface VoucherHoldAmounts {
  /** The whole prepayment for this unit: what the customer paid online. */
  held: Agorot
  /** The platform's take out of that prepayment. */
  commission: Agorot
  /** What the supplier receives when this voucher is redeemed. */
  release: Agorot
}

/**
 * Distributes a line's total commission across its units in proportion to what
 * each unit was charged, so the per-unit holds sum back to the line exactly.
 *
 * Why not reuse the first-unit-absorbs-the-remainder split used for the
 * prepayment itself: applied independently to the commission it can hand unit 1
 * a commission larger than unit 1's own charge. With quantity 10, a 1000 agorot
 * charge and a 995 agorot commission, that split gives unit 1 a held of 100 and
 * a commission of 104, i.e. a negative supplier share and a row the
 * escrow_holds_conservation CHECK would reject. Distributing the remainder
 * against each unit's remaining room cannot produce that, because a unit is
 * never given more than it was charged.
 */
export function splitCommissionPerUnit(
  heldPerUnit: readonly Agorot[],
  totalCommission: Agorot,
): Agorot[] {
  if (heldPerUnit.length === 0) {
    throw new RangeError('at least one unit is required')
  }
  const totalHeld = sumAgorot(heldPerUnit)
  if (totalCommission < 0) {
    throw new RangeError('commission must not be negative')
  }
  if (totalCommission > totalHeld) {
    throw new RangeError('commission must not exceed the amount held')
  }
  if (totalHeld === 0) {
    return heldPerUnit.map(() => agorot(0))
  }

  const shares = heldPerUnit.map((held) => Math.floor((held * totalCommission) / totalHeld))
  let remainder = totalCommission - shares.reduce((sum, share) => sum + share, 0)

  // Largest fractional part first, ties by unit order, so the distribution is
  // deterministic and reproducible from the same inputs.
  const byFraction = heldPerUnit
    .map((held, index) => ({
      index,
      fraction: (held * totalCommission) % totalHeld,
    }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index)

  for (const { index } of byFraction) {
    if (remainder === 0) break
    const room = (heldPerUnit[index] as number) - (shares[index] as number)
    const take = Math.min(room, remainder)
    shares[index] = (shares[index] as number) + take
    remainder -= take
  }

  return shares.map((share) => agorot(share))
}

/**
 * Builds the per-unit hold rows for one coupon order line. `heldPerUnit` is the
 * per-unit prepayment already computed by the settlement engine, so this adds
 * no rounding of its own beyond splitting the commission.
 */
export function buildVoucherHolds(
  heldPerUnit: readonly Agorot[],
  totalCommission: Agorot,
): VoucherHoldAmounts[] {
  const commissions = splitCommissionPerUnit(heldPerUnit, totalCommission)
  return heldPerUnit.map((held, index) => {
    const commission = commissions[index] as Agorot
    return { held, commission, release: agorot(held - commission) }
  })
}
