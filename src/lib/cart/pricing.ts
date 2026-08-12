import {
  type CartStorageItem,
  type CartView,
  type CartViewItem,
  EMPTY_CART,
} from '@/lib/cart/types'
import { calculateCommission } from '@/lib/commerce/commission'
import { type Agorot, agorot, ilsToAgorot, multiplyAgorot } from '@/lib/commerce/money'
import type { ProductType } from '@/types/database'

const ZERO = agorot(0)

type ProductRow = {
  id: string
  slug: string
  name_he: string
  /**
   * The live enum, not the two values the cart can price. Narrowing this to
   * `'physical' | 'coupon'` made every other value invisible to the compiler
   * while the database kept returning them. See `productType` below.
   */
  type: ProductType
  kenyon_price: number | null
  stock_quantity: number | null
  status: string
  deleted_at: string | null
  images: unknown
  is_coupon_enabled: boolean
  platform_percent?: number | null
  discount_percent?: number | null
  coupon_price_ils?: number | null
  cashback_percent?: number | null
}

type VariantRow = {
  id: string
  product_id: string
  price: number | null
  price_modifier: number
  stock_quantity: number | null
  is_active: boolean
  deleted_at: string | null
}

// CONTRADICTIONS C1: platform_percent has no default anywhere. A product without
// it cannot be priced, so the cart marks the line unavailable instead of inventing
// a percent. cashback_percent is a genuine opt-in perk, so absent means zero.
const DEFAULT_CASHBACK_PERCENT = 0

function firstImage(images: unknown): string | null {
  if (!Array.isArray(images)) return null
  const first = images.find((u): u is string => typeof u === 'string')
  return first ?? null
}

function resolveUnitPrice(product: ProductRow, variant: VariantRow | null): number {
  if (variant) {
    return Number(
      variant.price ?? Number(product.kenyon_price ?? 0) + Number(variant.price_modifier),
    )
  }
  return Number(product.kenyon_price ?? 0)
}

function isAvailable(product: ProductRow, variant: VariantRow | null, quantity: number): boolean {
  if (product.status !== 'active' || product.deleted_at) return false
  const stock = variant?.stock_quantity ?? product.stock_quantity
  if (stock == null) return true
  return stock >= quantity
}

/**
 * The cart prices exactly two shapes, coupon and physical. `products.type` is a
 * Postgres enum that already holds a third value in production (`service`) and
 * gains a fourth (`recurring`) whenever PENDING-109 is applied, so anything the
 * cart does not recognise returns null and the line is refused.
 *
 * This used to end in `: 'physical'`, which meant an unrecognised type was sold
 * once, at its physical price, with no type error and no failing test. For a
 * recurring product that is a subscription charged a single time; the shape of
 * defect the `priceable` gate below already exists to prevent.
 *
 * `is_coupon_enabled` still wins, because it is an explicit admin opt-in rather
 * than an unhandled case.
 */
function productType(product: ProductRow): 'physical' | 'coupon' | null {
  if (product.type === 'coupon' || product.is_coupon_enabled) return 'coupon'
  if (product.type === 'physical') return 'physical'
  return null
}

/** Null when the admin has not set the mandatory per-product percent yet. */
function platformPercent(product: ProductRow): number | null {
  const value = product.platform_percent
  if (value == null || Number.isNaN(Number(value))) return null
  return Number(value)
}

/** Null when the admin has not set the mandatory absolute coupon price yet. */
function couponPriceIls(product: ProductRow): number | null {
  const value = product.coupon_price_ils
  if (value == null || Number.isNaN(Number(value)) || Number(value) <= 0) return null
  return Number(value)
}

function cashbackPercent(product: ProductRow): number {
  const value = product.cashback_percent
  return value != null && !Number.isNaN(Number(value)) ? Number(value) : DEFAULT_CASHBACK_PERCENT
}

export function buildCartView(
  cartId: string | null,
  storageItems: CartStorageItem[],
  products: ProductRow[],
  variants: VariantRow[],
  /**
   * A discount code already evaluated against this cart, in agorot. Passed in
   * rather than looked up here so this stays a pure function of its inputs and
   * so the coupon is read once per request instead of once per caller.
   */
  coupon: { code: string; label: string; discountAgorot: number } | null = null,
): CartView {
  if (storageItems.length === 0) {
    return { ...EMPTY_CART, id: cartId }
  }

  const productMap = new Map(products.map((p) => [p.id, p]))
  const variantMap = new Map(variants.map((v) => [v.id, v]))

  const commissionLines: {
    id: string
    productType: 'physical' | 'coupon'
    unitPrice: Agorot
    quantity: number
    platformPercent: number
    couponPriceUnit?: Agorot
    discountPercent?: number
    cashbackPercent: number
  }[] = []
  const viewItems: CartViewItem[] = []

  for (const item of storageItems) {
    const product = productMap.get(item.product_id)
    if (!product) continue

    const variant = item.variant_id ? (variantMap.get(item.variant_id) ?? null) : null
    if (item.variant_id && (!variant || variant.product_id !== product.id)) continue

    // The only float-to-integer boundary in the cart. `kenyon_price` is a
    // `numeric` column and arrives as a JS number; it is converted to agorot
    // here, once, and every downstream value is integer arithmetic on the
    // result. Nothing below ever divides by 100 to get back.
    const unitPrice = ilsToAgorot(resolveUnitPrice(product, variant).toFixed(2))
    const lineTotal = multiplyAgorot(unitPrice, item.quantity)
    const type = productType(product)
    const lineKey = `${item.product_id}::${item.variant_id ?? 'null'}`

    const percent = platformPercent(product)
    const couponPrice = couponPriceIls(product)
    const couponPriceUnit =
      type === 'coupon' && couponPrice != null ? ilsToAgorot(couponPrice.toFixed(2)) : null
    const discountPercent =
      type === 'physical' && product.discount_percent != null ? product.discount_percent : undefined

    // Both types need the percent since 2026-07-27, and a coupon additionally
    // needs its admin-set absolute price. A line missing either renders as
    // unavailable and is kept OUT of the money engine (which would rightly
    // refuse to price it) instead of being priced with an invented number.
    //
    // The percent used to be defaulted to 0 here for lines that were already
    // unavailable, which was harmless while a coupon's percent did nothing.
    // It is not harmless now: 0% on a coupon means the platform takes nothing
    // and the whole prepayment is held for the supplier.
    // `type == null` is a product shape the cart cannot price at all, and joins
    // the same refusal path as a missing percent rather than being guessed at.
    const priceable =
      type != null && percent != null && (type !== 'coupon' || couponPriceUnit != null)
    if (priceable) {
      commissionLines.push({
        id: lineKey,
        productType: type,
        unitPrice,
        quantity: item.quantity,
        platformPercent: percent,
        couponPriceUnit: couponPriceUnit ?? undefined,
        discountPercent,
        cashbackPercent: cashbackPercent(product),
      })
    }

    viewItems.push({
      product_id: item.product_id,
      variant_id: item.variant_id,
      quantity: item.quantity,
      name_he: product.name_he,
      slug: product.slug,
      image_url: firstImage(product.images),
      unit_price: unitPrice,
      line_total: lineTotal,
      // Display only, and only ever reached with `available: false` below, since
      // a null type forces `priceable` false. The two components that read this
      // field both additionally require `balance_due_at_business > 0`, which
      // stays ZERO for any line the money engine never saw.
      type: type ?? 'physical',
      available: priceable && isAvailable(product, variant, item.quantity),
      platform_fee: ZERO,
      supplier_due: ZERO,
      customer_pays_now: ZERO,
      balance_due_at_business: ZERO,
      platform_percent_bp: 0,
      // Carried through from storage untouched. This is the percent the
      // catalogue held when the shopper added the line, which is not
      // necessarily `percent` above: that one is what the product says now.
      platform_percent_snapshot: item.platform_percent_snapshot ?? null,
      coupon_price_unit: couponPriceUnit,
    })
  }

  if (viewItems.length === 0 || commissionLines.length === 0) {
    return { ...EMPTY_CART, id: cartId }
  }

  const commission = calculateCommission({
    idempotencyKey: cartId ?? 'preview',
    lines: commissionLines,
  })

  const lineByKey = new Map(commission.lines.map((line) => [line.id, line]))

  for (const viewItem of viewItems) {
    const key = `${viewItem.product_id}::${viewItem.variant_id ?? 'null'}`
    const line = lineByKey.get(key)
    if (!line) continue
    viewItem.platform_fee = line.platformFee
    viewItem.supplier_due = line.supplierDue
    viewItem.customer_pays_now = line.customerPaysNow
    viewItem.balance_due_at_business = line.balanceDueAtBusiness
    viewItem.line_total = line.faceValue
    viewItem.platform_percent_bp = line.platformPercentBps
  }

  const itemCount = viewItems.reduce((sum, item) => sum + item.quantity, 0)

  // Cap here as well as in the settlement engine. The cart is what the shopper
  // reads and the settlement is what the card is charged; if only one of them
  // capped, a large code on a small cart would show one number and bill
  // another, which is the disagreement this repo keeps paying for.
  const payableAgorot = commission.customerPaysNow
  const discountAgorot = agorot(
    coupon ? Math.max(0, Math.min(coupon.discountAgorot, payableAgorot)) : 0,
  )

  return {
    id: cartId,
    items: viewItems,
    item_count: itemCount,
    subtotal: payableAgorot,
    platform_fee: commission.platformFee,
    supplier_due: commission.supplierDue,
    balance_due_at_business: commission.balanceDueAtBusiness,
    coupon:
      coupon && discountAgorot > 0
        ? { code: coupon.code, label: coupon.label, discount: discountAgorot }
        : null,
    discount: discountAgorot,
    total: agorot(payableAgorot - discountAgorot),
  }
}
