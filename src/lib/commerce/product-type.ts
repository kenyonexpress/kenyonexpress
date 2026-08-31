/**
 * What a product IS to a shopper, from the two columns that both claim to say.
 *
 * THE MEASURED BUG. Five live products are `type = 'physical'` with
 * `is_coupon_enabled = true`: barbecue, barbecue-2, restaurants-meat-2,
 * restaurants-meat-3 and ארוחה-בשרית-זוגית. Every path that bills them already
 * reads the pair together -- `cart/pricing.ts` prices them as coupons,
 * `category-page.ts` files them under coupons, the Meilisearch document builder
 * indexes them as coupons -- and so does the product page itself, which shows
 * them the coupon pricing block and hides the shipping block.
 *
 * The one place that read `products.type` alone was the sentence under the
 * supplier's phone number, and it told a shopper buying a voucher redeemed at a
 * restaurant counter "המוצר נשלח ומסופק על ידי הספק". Measured on a built
 * server at /product/barbecue-2 and /product/restaurants-meat-2. The product
 * tag line had the same split, printing "מוצר פיזי" on the same five pages.
 *
 * So the resolution lives here, once, and the page asks rather than derives.
 * `is_coupon_enabled` wins for the same reason `pricing.ts` gives it the win:
 * it is an explicit admin opt-in on the product page, not an unhandled case.
 */

/**
 * The four the storefront can say a sentence about.
 *
 * `recurring` is not in the generated enum yet -- it arrives with 135 --
 * and is accepted here anyway, because `recurring.ts` already reads rows that
 * hold it and a type this file cannot name is a type the caller has to widen at
 * the call site.
 */
export type StorefrontProductType = 'coupon' | 'physical' | 'service' | 'recurring'

export type ProductTypeSource = {
  /** `products.type`, the Postgres enum. Widened for the member above. */
  type: string | null
  /** `products.is_coupon_enabled`, the admin's per-product opt-in. */
  is_coupon_enabled?: boolean | null
}

/**
 * NOT `: 'physical'` at the end, which is the mistake `cart/pricing.ts`
 * documents having made once: an unrecognised enum member fell through to the
 * physical branch and a subscription was sold as a one-off. A display sentence
 * cannot refuse the way a price can, so an unknown type gets `service` -- the
 * one wording in `FULFILMENT_NOTE` that promises neither shipping nor a counter
 * to redeem at, and therefore the only one that cannot be wrong.
 */
export function resolveStorefrontProductType(product: ProductTypeSource): StorefrontProductType {
  if (product.is_coupon_enabled) return 'coupon'
  switch (product.type) {
    case 'coupon':
    case 'physical':
    case 'service':
    case 'recurring':
      return product.type
    default:
      return 'service'
  }
}

/** The tag line's wording for the resolved type, so it cannot drift from it. */
const TYPE_LABEL: Record<StorefrontProductType, string> = {
  coupon: 'קופון',
  physical: 'מוצר פיזי',
  service: 'שירות',
  recurring: 'מנוי',
}

export function storefrontProductTypeLabel(type: StorefrontProductType): string {
  return TYPE_LABEL[type]
}
