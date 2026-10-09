import type { CouponOffer } from '@/lib/commerce/coupon-offer'
import { shekelsFromIlsCompactPlain } from '@/lib/money-format'

/**
 * Everything the Open Graph card SAYS, decided here rather than inside the JSX
 * that draws it.
 *
 * The split is not tidiness. `next/og` renders through Satori in a serverless
 * function; a mistake in the numbers surfaces as a 1200x630 PNG that has to be
 * looked at, on a surface nobody looks at — an OG card is seen by the recipient
 * of a share, never by the person who shipped it. Everything decidable is
 * decided in a pure function so it can be asserted instead.
 *
 * THE PRICE COMES FROM THE OFFER, for the third time in this codebase and the
 * same reason: `price_ils` on a coupon is what the goods cost at the business,
 * not what the site charges. The Merchant feed and the share message already
 * carry that rule; a card that showed ₪200 next to a page saying ₪80 would be
 * the most visible place yet to break it.
 */

export interface OgCardInput {
  name: string
  supplierName: string | null
  priceIls: number | null
  offer: CouponOffer | null
}

export interface OgCard {
  /** Product name, clipped to what fits two lines at the card's type size. */
  title: string
  supplier: string | null
  /** The big number. Null when nothing honest can be quoted. */
  price: string | null
  /** `שולם באתר` vs a plain price, so the number is never read as the total. */
  priceLabel: string | null
  /** `+ ₪120 בבית העסק`, only when there is a balance. */
  balance: string | null
  /** Struck-through sticker price, only when there is a real saving. */
  wasPrice: string | null
  /** `50%-`, only when there is a real saving. Null suppresses the badge. */
  discountBadge: string | null
}

/**
 * Satori has no text-overflow, no line clamp and no ellipsis: text that does
 * not fit is drawn outside the card and silently cropped by the PNG boundary.
 * So the clip happens here, in characters, at the length two lines of the
 * card's 64px Heebo hold.
 */
const TITLE_MAX = 60

function clip(value: string, max: number): string {
  const text = value.trim()
  if (text.length <= max) return text
  // Cut on a word boundary when one is close, so a Hebrew phrase does not end
  // mid-word; fall back to a hard cut for a single long token.
  const hard = text.slice(0, max)
  const lastSpace = hard.lastIndexOf(' ')
  return `${(lastSpace > max - 12 ? hard.slice(0, lastSpace) : hard).trimEnd()}…`
}

function shekelsFromIls(value: number): string {
  return shekelsFromIlsCompactPlain(value)
}

export function buildOgCard(input: OgCardInput): OgCard {
  const title = clip(input.name, TITLE_MAX)
  const supplier = input.supplierName?.trim() || null

  if (input.offer?.sellable) {
    const { paidOnlineIls, balanceAtBusinessIls, fullPriceIls, discountPercent } = input.offer
    return {
      title,
      supplier,
      price: shekelsFromIls(paidOnlineIls),
      priceLabel: 'שולם באתר',
      balance:
        balanceAtBusinessIls > 0 ? `+ ${shekelsFromIls(balanceAtBusinessIls)} בבית העסק` : null,
      // Only when the sticker price is genuinely higher. A strike-through on an
      // equal number claims a saving that does not exist — the same rule the
      // Merchant feed applies to `g:sale_price`.
      wasPrice: fullPriceIls > paidOnlineIls ? shekelsFromIls(fullPriceIls) : null,
      discountBadge: discountPercent > 0 ? `${discountPercent}%-` : null,
    }
  }

  // Unsellable coupon, or a product with no price: the card carries the name
  // and the business and says nothing about money. Falling back to `price_ils`
  // here is precisely the mistake this module exists to prevent.
  if (input.offer || input.priceIls === null) {
    return {
      title,
      supplier,
      price: null,
      priceLabel: null,
      balance: null,
      wasPrice: null,
      discountBadge: null,
    }
  }

  return {
    title,
    supplier,
    price: shekelsFromIls(input.priceIls),
    priceLabel: null,
    balance: null,
    wasPrice: null,
    discountBadge: null,
  }
}
