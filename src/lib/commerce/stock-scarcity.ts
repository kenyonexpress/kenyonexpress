/**
 * What the shopper is told about how much is left.
 *
 * THE RULE IS A FRACTION, NOT A NUMBER, and that is the whole reason
 * `stock_initial` exists. "3 left" is nearly gone out of 100 and comfortable
 * out of 4; a threshold on the absolute number would shout on one product and
 * stay silent on the other for the same real scarcity.
 *
 * WHERE THE HONESTY LINE IS. Israeli consumer law limits urgency claims to ones
 * the seller can substantiate, which is the same reason the countdown timer on
 * a deal is driven only by a real `offer_valid_until`. So this says nothing
 * unless a stock figure exists AND the fraction is genuinely low; it never
 * invents a number, never counts down on its own, and returns `hidden` for the
 * ordinary case rather than something vaguer like "limited availability".
 *
 * IT READS *AVAILABLE*, NOT THE LEVEL. Stock held by another shopper's live
 * checkout is not stock this shopper can buy, and showing the raw level would
 * mean promising units that are already spoken for. The 15-minute reservation
 * window is exactly when that difference matters.
 */

/** Below this fraction of the original, the count is worth showing. */
export const SCARCITY_FRACTION = 0.2

export type StockDisplay =
  | { kind: 'untracked' }
  | { kind: 'in_stock' }
  | { kind: 'low'; remaining: number }
  | { kind: 'sold_out' }

export interface StockInput {
  /** `available_stock()`: the level minus live reservations. Null = not tracked. */
  available: number | null
  /** `products.stock_initial`. Null falls back to the threshold rule. */
  initial?: number | null
  /** `products.low_stock_threshold`. The absolute floor, whatever the fraction says. */
  threshold?: number | null
}

/**
 * The count shows when EITHER rule fires, not only the fraction.
 *
 * A product restocked to four units has a fraction of 1.0 at three left, which
 * would stay silent while the shelf is nearly empty. The threshold column
 * already exists for exactly that case and an operator can set it per product,
 * so the two rules are a union rather than a replacement.
 */
export function stockDisplay(input: StockInput): StockDisplay {
  const { available } = input
  if (available === null || available === undefined) return { kind: 'untracked' }
  if (!Number.isFinite(available)) return { kind: 'untracked' }
  if (available <= 0) return { kind: 'sold_out' }

  const initial = input.initial ?? null
  const threshold = input.threshold ?? null

  const fractionSaysLow =
    initial !== null && initial > 0 && available / initial <= SCARCITY_FRACTION
  const thresholdSaysLow = threshold !== null && threshold > 0 && available <= threshold

  return fractionSaysLow || thresholdSaysLow
    ? { kind: 'low', remaining: available }
    : { kind: 'in_stock' }
}

/**
 * The Hebrew line, or null when nothing should be said.
 *
 * `null` rather than an empty string so a caller cannot accidentally render an
 * empty urgency badge, which is a box with no text and looks like a bug.
 */
export function stockMessageHebrew(display: StockDisplay): string | null {
  switch (display.kind) {
    case 'sold_out':
      return 'אזל המלאי'
    case 'low':
      // The dual again: "נותרו 2" reads as a typo to a Hebrew speaker.
      if (display.remaining === 1) return 'נותרה יחידה אחרונה'
      if (display.remaining === 2) return 'נותרו שתי יחידות'
      return `נותרו ${display.remaining} יחידות`
    default:
      return null
  }
}

/** The same line for a coupon, whose unit is a coupon and not a piece of goods. */
export function couponStockMessageHebrew(display: StockDisplay): string | null {
  switch (display.kind) {
    case 'sold_out':
      return 'הדיל נסגר'
    case 'low':
      if (display.remaining === 1) return 'נותר קופון אחרון'
      if (display.remaining === 2) return 'נותרו שני קופונים'
      return `נותרו ${display.remaining} קופונים`
    default:
      return null
  }
}

/** Whether the buy button must be disabled. Never inferred from the message. */
export function isSoldOut(display: StockDisplay): boolean {
  return display.kind === 'sold_out'
}
