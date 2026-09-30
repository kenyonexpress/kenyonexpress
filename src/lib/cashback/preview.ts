import { type Agorot, agorot, applyBp, parseIls, percentToBp } from '@/lib/money'

/**
 * What a product page may promise about cashback, before any purchase.
 *
 * THE RATE IS THE PRODUCT'S, THE BASIS IS WHAT THE SHOPPER PAYS NOW. That is
 * the same pair `lib/commerce/commission.ts` snapshots onto the order line
 * (`cashbackPercentBps` over `customerPaysNow`), so the number printed beside
 * the price is the number the ledger credits after shipment or redemption,
 * and never a second calculation that can drift from it. For a coupon the
 * basis is the online charge, not the sticker price of the goods: 5% of a
 * ₪200 meal bought for ₪80 is ₪4, and saying ₪10 would be a false claim.
 *
 * NULL IS "SAY NOTHING". A zero or absent rate is the ordinary state of most
 * of the catalogue (`cashback_percent` defaults to 0), and a line reading
 * "0% cashback" is noise the shopper has to read past. Same for a price that
 * cannot be charged: the buy button is already refusing it, and quoting a
 * reward on a purchase that cannot happen is the kind of promise the
 * consumer-protection rules on this site exist to keep off the page.
 *
 * Every step is integer agorot through `lib/money.ts`. The percent arrives as
 * the column stores it (a numeric with two decimals) and is turned into basis
 * points exactly once, the way the settlement engine does it.
 */
export interface CashbackPreview {
  /** The rate as the admin typed it, for the sentence. */
  percent: number
  /** What this one unit earns, in agorot, integer half-up. */
  unitAgorot: Agorot
}

export function cashbackPreview(
  percent: number | string | null | undefined,
  paidNowIls: number | null | undefined,
): CashbackPreview | null {
  if (percent == null || paidNowIls == null) return null
  const rate = typeof percent === 'string' ? Number.parseFloat(percent) : percent
  if (!Number.isFinite(rate) || rate <= 0) return null
  if (!Number.isFinite(paidNowIls) || paidNowIls <= 0) return null

  const basis = parseIls(paidNowIls.toFixed(2))
  const unitAgorot = applyBp(basis, percentToBp(rate))
  if (unitAgorot <= 0) return null
  return { percent: rate, unitAgorot: agorot(unitAgorot) }
}
