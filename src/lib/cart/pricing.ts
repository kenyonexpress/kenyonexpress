import { type BundleDefinition, evaluateBundles } from '@/lib/bundles/evaluate'
import {
  type CartShipping,
  type CartStorageItem,
  type CartView,
  type CartViewItem,
  EMPTY_CART,
  type UnavailableReason,
} from '@/lib/cart/types'
import { calculateCommission } from '@/lib/commerce/commission'
import { isImplausibleDiscountAgorot } from '@/lib/commerce/implausible-discount'
import { type Agorot, agorot, ilsToAgorot, multiplyAgorot } from '@/lib/commerce/money'
import {
  DEFAULT_SHIPPING_METHOD_ID,
  type ShippingMethod,
  resolveShippingMethod,
} from '@/lib/shipping/methods'
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
  /**
   * The compare-at price, and the same column the "-NN%" badge on the card
   * divides by (`ProductCard.tsx`). Optional because it is genuinely absent on
   * most rows -- a product with no compare-at is not discounted, which is an
   * ordinary state and not a fault.
   */
  full_price?: number | null
  platform_percent?: number | null
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

/** A live flash-sale hold as the pricer needs it (STEP 61); `lib/flash-sales/read.ts` builds them. */
export type FlashHoldLike = {
  flash_sale_id: string
  product_id: string
  /** Integer agorot, straight off the sale row. */
  price_agorot: number
  /** Units the hold covers; a line asking for more is priced at the catalogue. */
  quantity: number
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

/**
 * The live stock behind one line, or null when the catalogue tracks none.
 *
 * A variant's own count wins over the product's whenever the line names a
 * variant, including when that count is zero: a sold-out size on a product with
 * forty in the warehouse is sold out, and falling back to the product number
 * there would sell it.
 */
function stockCeiling(product: ProductRow, variant: VariantRow | null): number | null {
  const stock = variant?.stock_quantity ?? product.stock_quantity
  if (stock == null) return null
  return Math.max(0, Math.trunc(Number(stock)))
}

/**
 * Why this line cannot be ordered, or null when it can.
 *
 * This replaced a boolean `isAvailable`, and the ordering of the branches is
 * the whole content of the change. `available: false` told the shopper the same
 * sentence for a product that stopped being sold, one with an empty shelf, one
 * where three are left and they asked for five, and one the admin has not
 * finished configuring -- and only the third of those has an action the shopper
 * can take. See `UnavailableReason` for why the order is this one.
 *
 * `priceable` is passed in rather than recomputed because the caller has
 * already decided it from the percent and the coupon price, and deciding it
 * twice is how the money engine and the availability flag drift apart.
 */
function unavailableReason(
  product: ProductRow,
  variant: VariantRow | null,
  quantity: number,
  priceable: boolean,
  /**
   * The line's own price, already converted once by the caller. Passed in for
   * the same reason `priceable` is: the number this refuses to sell at has to
   * be the exact number the checkout would have charged, and converting the
   * column a second time here is how the guard and the charge drift apart.
   */
  unitPrice: Agorot,
  /**
   * True when the price came from a flash-sale hold (STEP 61). A flash price
   * is a deliberate deep cut an admin typed against this product, so the
   * implausible-discount guard, which exists to catch a mistyped column, does
   * not apply to it.
   */
  flash = false,
): UnavailableReason | null {
  if (product.status !== 'active' || product.deleted_at) return 'delisted'
  // Before `unpriced` and before the stock reasons, because this line HAS a
  // price and the money engine would happily charge it. See the ordering note
  // on `UnavailableReason` and the measured threshold in
  // `lib/commerce/implausible-discount.ts`.
  if (!flash && isImplausibleDiscountAgorot(unitPrice, compareAtAgorot(product))) {
    return 'price_error'
  }
  if (!priceable) return 'unpriced'

  const stock = stockCeiling(product, variant)
  if (stock == null) return null
  if (stock === 0) return 'out_of_stock'
  if (stock < quantity) return 'insufficient_stock'
  return null
}

/**
 * The cart prices exactly two shapes, coupon and physical. `products.type` is a
 * Postgres enum that already holds a third value in production (`service`) and
 * gains a fourth (`recurring`) whenever 135 is applied, so anything the
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

/**
 * The compare-at price in agorot, or null when the row carries none.
 *
 * `full_price` is the column the "-NN%" badge on the card divides by
 * (`ProductCard.tsx`), so the guard and the badge are reading the same pair of
 * numbers. A badge that says -100% beside a line that sells is exactly the
 * contradiction this is here to prevent.
 */
function compareAtAgorot(product: ProductRow): Agorot | null {
  const value = product.full_price
  if (value == null || Number.isNaN(Number(value))) return null
  try {
    return ilsToAgorot(Number(value).toFixed(2))
  } catch {
    return null
  }
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
  coupon: {
    code: string
    label: string
    discountAgorot: number
    stack?: { code: string; discountAgorot: number }[]
  } | null = null,
  /**
   * The shipping method the shopper's cookie names, already resolved against
   * the registry by the caller. Ignored when no line is physical: the view
   * reports `shipping: null` and the selector never renders.
   */
  shippingMethod: ShippingMethod = resolveShippingMethod(DEFAULT_SHIPPING_METHOD_ID),
  /**
   * The active bundle rules whose members this cart might hold (STEP 60),
   * already read by the caller. Evaluated here, after the lines are priced,
   * because the per-bundle cap needs each line's on-site charge and the
   * commission ceiling needs the engine's platform fee. Empty is the default
   * and the ordinary state, and prices exactly as before.
   */
  bundles: BundleDefinition[] = [],
  /** The clock the bundle windows are judged by; injectable for tests. */
  now: Date = new Date(),
  /**
   * The signed-in shopper's live flash-sale holds (STEP 61), already read by
   * the caller through their own session. A line whose product has a hold,
   * names no variant, and asks for no more than the hold's quantity is priced
   * at the sale's integer price instead of the catalogue's. Empty is the
   * default and the ordinary state, and prices exactly as before.
   */
  flashHolds: FlashHoldLike[] = [],
): CartView {
  if (storageItems.length === 0) {
    return { ...EMPTY_CART, id: cartId }
  }

  const productMap = new Map(products.map((p) => [p.id, p]))
  const variantMap = new Map(variants.map((v) => [v.id, v]))
  const holdByProduct = new Map(flashHolds.map((hold) => [hold.product_id, hold]))

  const commissionLines: {
    id: string
    productType: 'physical' | 'coupon'
    unitPrice: Agorot
    quantity: number
    platformPercent: number
    couponPriceUnit?: Agorot
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
    //
    // A flash-sale hold (STEP 61) is the one other source of a unit price,
    // and it is ALREADY integer agorot: the admin typed shekels once, the
    // action converted once, and the row carries the integer. Product-level
    // and whole-line only: a variant's modifier has no defined relation to a
    // flash price, and a line asking for more than the hold covers is priced
    // at the catalogue for all of it rather than split into two lines.
    const hold = item.variant_id ? undefined : holdByProduct.get(item.product_id)
    const flash =
      hold !== undefined &&
      item.quantity <= hold.quantity &&
      Number.isSafeInteger(hold.price_agorot) &&
      hold.price_agorot > 0
    const unitPrice = flash
      ? agorot(hold.price_agorot)
      : ilsToAgorot(resolveUnitPrice(product, variant).toFixed(2))
    const lineTotal = multiplyAgorot(unitPrice, item.quantity)
    const type = productType(product)
    const lineKey = `${item.product_id}::${item.variant_id ?? 'null'}`

    const percent = platformPercent(product)
    const couponPrice = couponPriceIls(product)
    const couponPriceUnit =
      type === 'coupon' && couponPrice != null ? ilsToAgorot(couponPrice.toFixed(2)) : null

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
    // A PHYSICAL LINE ALSO NEEDS A PRICE ABOVE ZERO, and that half was missing.
    //
    // The coupon half of this gate has been here since the commission engine
    // landed. The physical half had nothing: `resolveUnitPrice` returns 0 for a
    // product whose `kenyon_price` is null or 0, `ilsToAgorot` turns that into
    // a perfectly valid ZERO, and every layer downstream accepted it. Measured
    // against production on 2026-08-19, one ACTIVE product sits at
    // kenyon_price 0.00 - `restaurants-meat-2` - and it only escapes because it
    // is `is_coupon_enabled`, so it takes the coupon branch instead.
    //
    // Without this, a physical product an admin saved without a price would
    // have painted ₪0.00 with a live add-to-cart, priced at zero through the
    // whole cart, and reached `beginCheckout`, whose physical branch has no
    // price check either. Zero is not a discount; it is a missing value, and
    // the comment on the coupon branch in checkout.ts says exactly that about
    // its own: "a product missing a mandatory value cannot be sold".
    const priceable =
      type != null &&
      percent != null &&
      (type !== 'coupon' || couponPriceUnit != null) &&
      (type !== 'physical' || unitPrice > 0)
    const reason = unavailableReason(product, variant, item.quantity, priceable, unitPrice, flash)
    if (priceable) {
      commissionLines.push({
        id: lineKey,
        productType: type,
        unitPrice,
        quantity: item.quantity,
        platformPercent: percent,
        couponPriceUnit: couponPriceUnit ?? undefined,
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
      // Display only when `type` is null, and such a line is always unavailable:
      // a null type forces `priceable` false, which makes `unavailableReason`
      // return 'unpriced'. The two components that read this field both
      // additionally require `balance_due_at_business > 0`, which stays ZERO for
      // any line the money engine never saw.
      type: type ?? 'physical',
      available: reason === null,
      unavailable_reason: reason,
      max_quantity: stockCeiling(product, variant),
      platform_fee: ZERO,
      supplier_due: ZERO,
      customer_pays_now: ZERO,
      balance_due_at_business: ZERO,
      cashback: ZERO,
      platform_percent_bp: 0,
      // Carried through from storage untouched. This is the percent the
      // catalogue held when the shopper added the line, which is not
      // necessarily `percent` above: that one is what the product says now.
      platform_percent_snapshot: item.platform_percent_snapshot ?? null,
      coupon_price_unit: couponPriceUnit,
      flash_sale_id: flash ? hold.flash_sale_id : null,
    })
  }

  if (viewItems.length === 0) {
    return { ...EMPTY_CART, id: cartId }
  }

  /**
   * No line is priceable, so there is nothing for the money engine to settle --
   * but there is still a cart, and it used to disappear.
   *
   * "Unpriceable" is narrower than "unavailable": an out-of-stock line is still
   * priced and still rendered. This is the line missing the mandatory
   * `platform_percent`, or a coupon missing its absolute price (C1) -- an admin
   * has half-configured a product that is otherwise on sale. When that was true
   * of every line, this branch shared its `return` with the no-lines case and
   * handed back EMPTY_CART, so the shopper opened /cart, was told it was empty,
   * and the `carts` row still held everything. Nothing was lost and nothing said
   * so: adding the same item again would silently rejoin a line that had been
   * there all along, and the banner offering to clear unavailable lines could
   * never appear in precisely the case where the whole cart was unavailable.
   *
   * So the lines are returned and the money stays at zero. `calculateCommission`
   * is not called rather than called with nothing, because a settlement of an
   * empty ledger is a question worth not asking.
   */
  if (commissionLines.length === 0) {
    return {
      ...EMPTY_CART,
      id: cartId,
      items: viewItems,
      item_count: viewItems.reduce((sum, item) => sum + item.quantity, 0),
    }
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
    viewItem.cashback = line.cashbackAmount
    viewItem.line_total = line.faceValue
    viewItem.platform_percent_bp = line.platformPercentBps
  }

  const itemCount = viewItems.reduce((sum, item) => sum + item.quantity, 0)

  // Cap here as well as in the settlement engine. The cart is what the shopper
  // reads and the settlement is what the card is charged; if only one of them
  // capped, a large code on a small cart would show one number and bill
  // another, which is the disagreement this repo keeps paying for.
  const payableAgorot = commission.customerPaysNow

  // Bundles first (STEP 60), from the lines the engine actually priced: a
  // line it refused (unpriced, delisted) is not in `commission.lines` and so
  // cannot complete a set. The settlement caps the WHOLE discount at the
  // commission, so the same ceiling is applied here, on the bundle share
  // first and then on whatever room the coupon has left, so the two numbers
  // the shopper reads add up to exactly what the card is reduced by.
  const bundleEvaluation = evaluateBundles(
    bundles,
    commission.lines.map((engineLine) => {
      const [product_id] = engineLine.id.split('::')
      return {
        product_id: product_id ?? engineLine.id,
        quantity: engineLine.quantity,
        customer_pays_now: engineLine.customerPaysNow,
      }
    }),
    now,
  )
  const discountCeiling = Math.max(0, Math.min(payableAgorot, commission.platformFee))
  let bundleRoom = discountCeiling
  const appliedBundles = bundleEvaluation.applied.flatMap((applied) => {
    const discount = agorot(Math.max(0, Math.min(applied.discount, bundleRoom)))
    if (discount <= 0) return []
    bundleRoom -= discount
    return [{ ...applied, discount }]
  })
  const bundleDiscountAgorot = agorot(
    appliedBundles.reduce((sum, applied) => sum + applied.discount, 0),
  )

  // The coupon is capped at the payable total as it always was; when a bundle
  // took part of the commission, the coupon also yields to what is left of
  // it, so the pair never exceeds what settlement.ts will honour.
  const couponCeiling =
    bundleDiscountAgorot > 0
      ? Math.max(0, Math.min(payableAgorot, discountCeiling) - bundleDiscountAgorot)
      : payableAgorot
  const discountAgorot = agorot(
    coupon ? Math.max(0, Math.min(coupon.discountAgorot, couponCeiling)) : 0,
  )

  // A coupon is redeemed at the business, so a cart of coupons alone ships
  // nothing and gets no shipping line. One physical item is enough to need one.
  const shipping: CartShipping | null = viewItems.some((line) => line.type === 'physical')
    ? {
        method: shippingMethod.id,
        label: shippingMethod.label,
        cost: shippingMethod.costAgorot,
      }
    : null

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
        ? {
            code: coupon.code,
            label: coupon.label,
            discount: discountAgorot,
            ...(coupon.stack && coupon.stack.length > 1 ? { stack: coupon.stack } : {}),
          }
        : null,
    discount: discountAgorot,
    bundles: appliedBundles,
    bundle_discount: bundleDiscountAgorot,
    shipping,
    // The engine's own total, not a re-sum of the lines: one calculation.
    cashback: commission.cashbackAmount,
    total: agorot(
      Math.max(0, payableAgorot - discountAgorot - bundleDiscountAgorot) + (shipping?.cost ?? 0),
    ),
  }
}
