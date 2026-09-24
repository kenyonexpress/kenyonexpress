import type { CouponOffer } from '@/lib/commerce/coupon-offer'
import type { StorefrontProductType } from '@/lib/commerce/product-type'
import { formatDate } from '@/lib/i18n/format'
import { type MessageKey, t } from '@/lib/i18n/messages'
import type { OriginalPriceSource } from '@/lib/pricing/original-price-source'

/**
 * The small print of a product page: the short factual lines a shopper is
 * entitled to read before paying, built once from the data the page already
 * resolved and never from a second query.
 *
 * WHAT GOES IN, AND WHAT STAYS OUT. Every line here is derived from a column
 * or an offer the page renders elsewhere in full: the coupon's validity from
 * `couponOffer`, the warranty from `warranty_months`, the VAT posture from
 * `vat_exempt`, the basis of the struck-through price from pending 242. The
 * statutory cancellation terms (14 days, the fee cap, the redeemed-coupon
 * exception) are NOT restated: they live once, in the returns document at
 * `/refund_returns`, whose own test pins the numbers. A second copy of a legal
 * clause is a second document that can drift from the first, so this block
 * links to the clause and says nothing more about it.
 *
 * Pure. The page passes the offer, so the clock is read where `use cache`
 * permits it (see `product-detail.ts`), and the tests pass fixed dates.
 */

export interface SmallPrintInput {
  productType: StorefrontProductType
  couponOffer: CouponOffer | null
  /** `products.vat_exempt`. Null reads as "VAT included", the default posture. */
  vatExempt: boolean | null
  requiresShipping: boolean | null
  warrantyMonths: number | null
  /**
   * The stated basis of the struck-through price, ALREADY filtered by the
   * reference-price verdict: the page passes null when the strike itself is
   * suppressed, so this block cannot describe a claim the page does not make.
   */
  originalPriceSource: OriginalPriceSource | null
}

export interface SmallPrintLine {
  /** Stable, for React keys and for tests. */
  id: string
  text: string
  /** An optional link rendered after the text, with its own label. */
  link?: { href: string; label: string; external: boolean }
}

/** `{name}` substitution, the same shape `inquiry-links.ts` uses. */
function fill(key: MessageKey, vars: Record<string, string | number>): string {
  let out = t(key)
  for (const [name, value] of Object.entries(vars)) {
    out = out.replace(`{${name}}`, String(value))
  }
  return out
}

export function buildSmallPrint(input: SmallPrintInput): SmallPrintLine[] {
  const lines: SmallPrintLine[] = []
  const { productType, couponOffer } = input

  // The price posture first: it is the line the rest are read against.
  lines.push({
    id: 'vat',
    text: t(input.vatExempt ? 'pdp.smallPrint.vatExempt' : 'pdp.smallPrint.vatIncluded'),
  })

  if (input.originalPriceSource) {
    const { label, href } = input.originalPriceSource
    lines.push({
      id: 'price-basis',
      text: fill('pdp.smallPrint.priceBasis', { source: label }),
      ...(href ? { link: { href, label: t('pdp.priceSourceLink'), external: true } } : {}),
    })
  }

  if (productType === 'coupon' && couponOffer) {
    // Validity, in the same two forms `CouponTerms` prints in full. A closed
    // offer has no forward-looking validity to state, and `expiryDays` only
    // exists on a sellable offer.
    if (couponOffer.sellable && couponOffer.expiryDays != null && couponOffer.expiryDays > 0) {
      lines.push({
        id: 'coupon-valid-days',
        text: fill('pdp.smallPrint.couponValidDays', { days: couponOffer.expiryDays }),
      })
    }
    if (couponOffer.validUntil) {
      lines.push({
        id: 'offer-valid-until',
        text: fill('pdp.smallPrint.offerValidUntil', { date: formatDate(couponOffer.validUntil) }),
      })
    }
    lines.push({ id: 'coupon-single-use', text: t('pdp.smallPrint.couponSingleUse') })
    if (couponOffer.sellable && couponOffer.balanceAtBusinessIls > 0) {
      lines.push({ id: 'coupon-balance', text: t('pdp.smallPrint.couponBalance') })
    }
  }

  if (productType === 'physical') {
    if (input.requiresShipping !== false) {
      lines.push({ id: 'shipping', text: t('pdp.smallPrint.physicalShipping') })
    }
    if (input.warrantyMonths != null && input.warrantyMonths > 0) {
      lines.push({
        id: 'warranty',
        text: fill('pdp.smallPrint.warranty', { months: input.warrantyMonths }),
      })
    }
    lines.push({ id: 'stock', text: t('pdp.smallPrint.stockLimited') })
  }

  if (productType === 'recurring') {
    lines.push({ id: 'recurring', text: t('pdp.smallPrint.recurring') })
  }

  // One link, to the clause itself. See the module header for why the terms
  // are not repeated here.
  lines.push({
    id: 'cancellation',
    text: t('pdp.smallPrint.cancellation'),
    link: {
      href: '/refund_returns#how-to-cancel',
      label: t('pdp.smallPrint.cancellationLink'),
      external: false,
    },
  })

  lines.push({ id: 'images', text: t('pdp.smallPrint.imagesIllustrative') })

  return lines
}
