/**
 * The price block of a product page: what the thing is worth, what it costs
 * here, and the gap between them.
 *
 * NO BILLING HAPPENS HERE. Every number is display only; the amount actually
 * charged is derived server-side from `products.coupon_price_ils` by
 * `lib/commerce/coupon-offer.ts` and billed by the commission engine. This
 * component is given both figures and formats them.
 *
 * The percentages are still computed in integer agorot rather than on the
 * shekel floats the legacy `numeric` columns hand over, because a badge that
 * says 60% beside a price that works out to 59% is the same defect as a wrong
 * charge as far as a customer is concerned. `CLAUDE.md`: money is integers.
 */

/** Shekels to whole agorot. Display only, so it rounds instead of throwing. */
function toAgorot(ils: number): number {
  return Math.round(ils * 100)
}

/**
 * Whole-percent saving off the full value, or 0 when there is nothing to claim.
 * Rounds down, so the badge never promises a shopper more than they get.
 */
export function savingsPercent(
  fullPriceIls: number | null | undefined,
  priceIls: number | null | undefined,
): number {
  if (fullPriceIls == null || priceIls == null) return 0
  const full = toAgorot(fullPriceIls)
  const paid = toAgorot(priceIls)
  if (full <= 0 || paid < 0 || paid >= full) return 0
  return Math.floor(((full - paid) * 100) / full)
}

/**
 * `₪399`, not `₪399.00`. Measured off the live single-product template, which
 * prints agorot only when a price actually has them.
 */
export function shekels(value: number): string {
  return `₪${value.toLocaleString('he-IL', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

const SIZES = {
  sm: { price: 'text-lg', strike: 'text-xs', badge: 'text-[11px] px-1.5 py-0.5' },
  md: { price: 'text-2xl', strike: 'text-sm', badge: 'text-xs px-2 py-0.5' },
  lg: { price: 'text-3xl lg:text-4xl', strike: 'text-base', badge: 'text-sm px-2.5 py-1' },
} as const

export default function PriceDisplay({
  fullPriceIls,
  priceIls,
  size = 'lg',
  showSavings = true,
  className = '',
}: {
  /** The full value of the goods: what the business charges without the deal. */
  fullPriceIls: number | null | undefined
  /** What the shopper pays on this site. For a coupon, the absolute coupon price. */
  priceIls: number
  size?: keyof typeof SIZES
  showSavings?: boolean
  className?: string
}) {
  const s = SIZES[size]
  const saving = savingsPercent(fullPriceIls, priceIls)
  // Struck through only when it is genuinely higher. A "full price" equal to
  // or below the charge is a data error, and drawing a line through it would
  // turn that error into a discount claim.
  const showFull = fullPriceIls != null && toAgorot(fullPriceIls) > toAgorot(priceIls)

  return (
    <div className={`flex flex-wrap items-baseline gap-x-3 gap-y-1 ${className}`}>
      {showFull && (
        <del className={`text-gray-400 line-through tabular-nums ${s.strike}`}>
          <span className="sr-only">מחיר מלא </span>
          {shekels(fullPriceIls)}
        </del>
      )}

      <span className={`font-bold tabular-nums text-[#e4002b] ${s.price}`}>
        <span className="sr-only">המחיר שלנו </span>
        {shekels(priceIls)}
      </span>

      {showSavings && saving > 0 && (
        <span
          className={`rounded-md bg-[#fed700] font-bold text-brand-dark ${s.badge}`}
          // The digits sit inside a Hebrew sentence, and a bare `%` after a
          // number flips to the wrong side of it without an explicit bidi
          // isolate around the numeric run.
        >
          חסכון <bdi>{saving}%</bdi>
        </span>
      )}
    </div>
  )
}
