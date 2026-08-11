import { assertPublishable } from '@/lib/commerce/product-money'
import type { ProductMoneyType } from '@/lib/commerce/product-money'

/**
 * The publish gate, applied to a whole selection at once.
 *
 * `runUpsertProduct` has gated single-product publishing through
 * `assertPublishable` for a while. The bulk "פרסם" button in `ProductsTable`
 * did not: it wrote `status: 'active'` straight onto every selected id. On the
 * live catalog that is not a theoretical hole. All 19 draft products carry a
 * NULL `supplier_id` and a NULL `platform_percent`, so selecting them and
 * pressing publish would have put 19 products on sale with no supplier and no
 * split, which is the fallback-by-omission that AGENTS.md exists to prevent.
 *
 * Once `009` adds its CHECK, the same click would instead surface a raw
 * Postgres constraint error. Gating here keeps the failure in Hebrew and names
 * every product and every reason at once.
 */

/** The product columns the gate needs. All of these exist in production. */
export interface BulkPublishProduct {
  id: string
  name_he: string | null
  type: string | null
  supplier_id: string | null
  price_ils: number | null
  platform_percent: number | null
  supplier_split_percent: number | null
  discount_percent: number | null
  coupon_price_ils: number | null
  coupon_expiry_days: number | null
}

/** The supplier columns the gate needs, keyed by supplier id. */
export interface BulkPublishSupplier {
  id: string
  name: string | null
  contact_phone: string | null
  address: string | null
  logo_url: string | null
  status: string | null
}

/**
 * The live enum `product_type` is (coupon, physical, service); the money
 * module's union is (coupon, physical, recurring). The two disagree on one
 * member each, so the mapping is explicit rather than a cast. `service` bills
 * like `physical` as far as the publish gate is concerned: neither has a coupon
 * face value and neither has a billing cycle.
 */
function gateType(type: string | null): ProductMoneyType {
  return type === 'coupon' || type === 'recurring' ? type : 'physical'
}

export interface BlockedProduct {
  id: string
  name: string
  reasons: string[]
}

/**
 * Which of `products` may not be published, and why.
 *
 * Returns one entry per failing product with every blocker for it, so a bulk
 * publish reports the whole truth in one pass instead of one product per click.
 */
export function findUnpublishableProducts(
  products: readonly BulkPublishProduct[],
  suppliers: readonly BulkPublishSupplier[],
): BlockedProduct[] {
  const byId = new Map(suppliers.map((s) => [s.id, s]))
  const blocked: BlockedProduct[] = []

  for (const product of products) {
    const supplier = product.supplier_id ? byId.get(product.supplier_id) : undefined

    const gate = assertPublishable({
      type: gateType(product.type),
      priceIls: product.price_ils,
      platformPercent: product.platform_percent,
      supplierSplitPercent: product.supplier_split_percent,
      discountPercent: product.discount_percent,
      couponPriceIls: product.coupon_price_ils,
      couponExpiryDays: product.coupon_expiry_days,
      // Deliberately absent. `recurring_amount_agorot` and `billing_interval`
      // are not columns in production yet (PENDING-109), and no live product
      // has type 'recurring', so the gate's recurring branch cannot fire. When
      // 109 lands, select those two columns and pass them here.
      supplier: supplier
        ? {
            id: supplier.id,
            name: supplier.name,
            phone: supplier.contact_phone,
            address: supplier.address,
            logoUrl: supplier.logo_url,
            status: supplier.status,
          }
        : { id: product.supplier_id },
    })

    if (!gate.ok) {
      blocked.push({
        id: product.id,
        name: product.name_he ?? product.id,
        reasons: gate.blockers.map((b) => b.message),
      })
    }
  }

  return blocked
}

/** The Hebrew message shown when a bulk publish is refused. */
export function bulkPublishErrorMessage(blocked: readonly BlockedProduct[]): string {
  const lines = blocked.map((b) => `${b.name}: ${b.reasons.join(' · ')}`)
  const head =
    blocked.length === 1 ? 'מוצר אחד לא ניתן לפרסום' : `${blocked.length} מוצרים לא ניתנים לפרסום`
  return `${head}. לא פורסם דבר. ${lines.join(' | ')}`
}
