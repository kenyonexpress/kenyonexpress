import { type Agorot, agorot, applyBp, percentToBp } from '@/lib/money'

/**
 * Per-product economics for the supplier's own catalogue view.
 *
 * This is deliberately NOT the payout math. `dashboard.ts` answers "what does
 * the platform owe you for what already sold"; this answers "what does one unit
 * of this product earn me if it sells", which is the question a supplier asks
 * while looking at a price. They disagree on purpose: nothing here has settled,
 * so nothing here is a receivable.
 *
 * The two product kinds split money in genuinely different ways, and the split
 * is the locked model, not a policy this module chooses:
 *
 *   coupon   The customer pays the coupon price on the site and that money is
 *            the platform's in full. The supplier collects the remainder --
 *            face value minus coupon price -- at the till, in cash that never
 *            enters our ledger. `platform_percent` does not apply: the discount
 *            IS the commission.
 *
 *   physical The customer pays the full price on the site, the platform keeps
 *            `platform_percent` of it, and the rest is owed to the supplier.
 *
 * `platform_percent` is per product and nullable. A null is not zero commission
 * -- it is an unconfigured product, and the page says so rather than showing a
 * flattering number that the checkout would not honour.
 */

export type SupplierProductRow = {
  id: string
  slug: string
  nameHe: string
  type: 'coupon' | 'physical' | 'other'
  status: string
  approvalStatus: string
  /** Face value. What the coupon is worth, or what a physical item lists at. */
  faceValueAgorot: Agorot
  /** Coupon products only: what the customer pays up front on the site. */
  couponPriceAgorot: Agorot | null
  /** Null means unconfigured, which is different from zero. */
  platformPercent: number | null
  imageUrl: string | null
}

export type SupplierProductEconomics = {
  /** What the supplier ends up with per unit, or null if not yet computable. */
  supplierNetAgorot: Agorot | null
  /** What the platform keeps per unit, or null if not yet computable. */
  platformCutAgorot: Agorot | null
  /** Where the supplier's money arrives from. */
  collectedAt: 'till' | 'platform' | null
  /** Set when the numbers cannot be trusted, so the UI can say why. */
  issue: 'no_platform_percent' | 'no_price' | 'coupon_price_above_face' | null
}

/**
 * Never throws on bad data. A catalogue row with a missing or contradictory
 * price is a data problem to surface, not an exception to raise inside a page
 * render -- the supplier still needs to see the other twenty products.
 */
export function productEconomics(row: SupplierProductRow): SupplierProductEconomics {
  const empty = {
    supplierNetAgorot: null,
    platformCutAgorot: null,
    collectedAt: null,
  } as const

  if (row.faceValueAgorot <= 0) return { ...empty, issue: 'no_price' }

  if (row.type === 'coupon') {
    const couponPrice = row.couponPriceAgorot
    if (couponPrice === null || couponPrice <= 0) return { ...empty, issue: 'no_price' }

    // A coupon that costs more than it is worth is not a discount, and the
    // subtraction below would hand the supplier a negative till take.
    if (couponPrice > row.faceValueAgorot) {
      return { ...empty, issue: 'coupon_price_above_face' }
    }

    return {
      supplierNetAgorot: agorot(row.faceValueAgorot - couponPrice),
      platformCutAgorot: couponPrice,
      collectedAt: 'till',
      issue: null,
    }
  }

  if (row.platformPercent === null) return { ...empty, issue: 'no_platform_percent' }

  // Integer basis points, never a float multiply: percentToBp then applyBp is
  // the same path checkout takes, so this page cannot quote a number the
  // checkout would round differently.
  const platformCut = applyBp(row.faceValueAgorot, percentToBp(row.platformPercent))

  return {
    supplierNetAgorot: agorot(row.faceValueAgorot - platformCut),
    platformCutAgorot: platformCut,
    collectedAt: 'platform',
    issue: null,
  }
}

export const PRODUCT_STATUS_LABEL_HE: Record<string, string> = {
  active: 'פעיל',
  draft: 'טיוטה',
  archived: 'בארכיון',
  out_of_stock: 'אזל',
}

export const APPROVAL_LABEL_HE: Record<string, string> = {
  approved: 'מאושר',
  pending: 'ממתין לאישור',
  rejected: 'נדחה',
}

export const ISSUE_LABEL_HE: Record<NonNullable<SupplierProductEconomics['issue']>, string> = {
  no_platform_percent: 'לא הוגדר אחוז עמלה למוצר',
  no_price: 'חסר מחיר',
  coupon_price_above_face: 'מחיר הקופון גבוה מהשווי',
}

/** Counts for the header strip. Cheap, and keeps the page free of arithmetic. */
export function summarizeCatalogue(rows: SupplierProductRow[]): {
  total: number
  active: number
  coupons: number
  needsAttention: number
} {
  let active = 0
  let coupons = 0
  let needsAttention = 0

  for (const row of rows) {
    if (row.status === 'active') active += 1
    if (row.type === 'coupon') coupons += 1
    if (productEconomics(row).issue !== null) needsAttention += 1
  }

  return { total: rows.length, active, coupons, needsAttention }
}
