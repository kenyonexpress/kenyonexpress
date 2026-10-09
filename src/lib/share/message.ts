import type { CouponOffer } from '@/lib/commerce/coupon-offer'
import { shekelsFromIlsCompact } from '@/lib/money-format'

/**
 * The Hebrew text a shared product carries, derived once for every channel.
 *
 * WHY THIS IS NOT A TEMPLATE STRING AT THE CALL SITE, WHICH IS WHAT IT WAS
 *
 * The share button quoted `shekelsFromIls(price)`, and for a COUPON `price` is
 * `basePrice` — `products.price_ils`, the sticker price of the goods at the
 * business. The page beside it renders `<CouponPricing>` off `couponOffer` and
 * shows a different, smaller number. So a customer sharing a ₪80 coupon sent
 * their friend "₪200", and the friend arrived at a page quoting ₪80.
 *
 * It is the same defect the Merchant feed was built to avoid, on a surface a
 * customer operates by hand, and it is the reason `coupon-offer.ts` exists at
 * all: the module's own header records the storefront having drifted off the
 * pricing model twice before. The rule that stops it recurring is that no
 * surface computes a coupon price itself — this one included.
 *
 * Pure and client-safe: the share buttons are client components.
 */

export interface ShareSubject {
  name: string
  /** Sticker price. Used only when there is no coupon offer. */
  priceIls: number | null
  /** Present for coupon products. When it is, it decides the number. */
  offer: CouponOffer | null
}

/** `₪399`, not `₪399.00`. Agorot appear only when the price has them. */
function shekelsFromIls(value: number): string {
  return shekelsFromIlsCompact(value)
}

/**
 * One line, no URL. The channel appends its own link — WhatsApp on a new line,
 * Facebook as the `u` parameter — and a URL baked in here would be sent twice.
 */
export function buildShareMessage(subject: ShareSubject): string {
  const lead = `מצאתי משהו שווה ב-KenyonExpress: ${subject.name}`

  if (subject.offer?.sellable) {
    const { paidOnlineIls, balanceAtBusinessIls, discountPercent } = subject.offer
    // Both halves, always. "₪80" alone sends someone to a counter believing
    // they owe nothing, which is the same thing the RSS description refuses to
    // do and for the same reason.
    const price =
      balanceAtBusinessIls > 0
        ? `${shekelsFromIls(paidOnlineIls)} באתר ועוד ${shekelsFromIls(balanceAtBusinessIls)} בבית העסק`
        : shekelsFromIls(paidOnlineIls)
    const saving = discountPercent > 0 ? ` (${discountPercent}% הנחה)` : ''
    return `${lead} — ${price}${saving}`
  }

  // A coupon with no admin price cannot be quoted. The product page refuses to
  // quote it too, so the share says nothing about money rather than falling
  // back to the sticker price, which is exactly the wrong number.
  if (subject.offer && !subject.offer.sellable) return lead

  if (subject.priceIls === null) return lead
  return `${lead} — ${shekelsFromIls(subject.priceIls)}`
}
