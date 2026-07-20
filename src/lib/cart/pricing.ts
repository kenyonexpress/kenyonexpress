import {
  type CartStorageItem,
  type CartView,
  type CartViewItem,
  EMPTY_CART,
} from '@/lib/cart/types'
import { calculateCommission } from '@/lib/commerce/commission'
import { agorot, ilsToAgorot } from '@/lib/commerce/money'

type ProductRow = {
  id: string
  slug: string
  name_he: string
  type: 'physical' | 'coupon'
  kenyon_price: number | null
  stock_quantity: number | null
  status: string
  deleted_at: string | null
  images: unknown
  is_coupon_enabled: boolean
  platform_percent?: number | null
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

const DEFAULT_PLATFORM_PERCENT = 10
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

function productType(product: ProductRow): 'physical' | 'coupon' {
  return product.type === 'coupon' || product.is_coupon_enabled ? 'coupon' : 'physical'
}

function platformPercent(product: ProductRow): number {
  const value = product.platform_percent
  return value != null && !Number.isNaN(Number(value)) ? Number(value) : DEFAULT_PLATFORM_PERCENT
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
): CartView {
  if (storageItems.length === 0) {
    return { ...EMPTY_CART, id: cartId }
  }

  const productMap = new Map(products.map((p) => [p.id, p]))
  const variantMap = new Map(variants.map((v) => [v.id, v]))

  const commissionLines: {
    id: string
    productType: 'physical' | 'coupon'
    unitPrice: ReturnType<typeof ilsToAgorot>
    quantity: number
    platformPercent: number
    cashbackPercent: number
  }[] = []
  const viewItems: CartViewItem[] = []

  for (const item of storageItems) {
    const product = productMap.get(item.product_id)
    if (!product) continue

    const variant = item.variant_id ? (variantMap.get(item.variant_id) ?? null) : null
    if (item.variant_id && (!variant || variant.product_id !== product.id)) continue

    const unitPrice = resolveUnitPrice(product, variant)
    const lineTotal = unitPrice * item.quantity
    const type = productType(product)
    const lineKey = `${item.product_id}::${item.variant_id ?? 'null'}`

    commissionLines.push({
      id: lineKey,
      productType: type,
      unitPrice: ilsToAgorot(unitPrice.toFixed(2)),
      quantity: item.quantity,
      platformPercent: platformPercent(product),
      cashbackPercent: cashbackPercent(product),
    })

    viewItems.push({
      product_id: item.product_id,
      variant_id: item.variant_id,
      quantity: item.quantity,
      name_he: product.name_he,
      slug: product.slug,
      image_url: firstImage(product.images),
      unit_price: unitPrice,
      line_total: lineTotal,
      type,
      available: isAvailable(product, variant, item.quantity),
      platform_fee: 0,
      supplier_due: 0,
      customer_pays_now: 0,
      balance_due_at_business: 0,
    })
  }

  if (viewItems.length === 0) {
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
    viewItem.platform_fee = agorot(line.platformFee) / 100
    viewItem.supplier_due = agorot(line.supplierDue) / 100
    viewItem.customer_pays_now = agorot(line.customerPaysNow) / 100
    viewItem.balance_due_at_business = agorot(line.balanceDueAtBusiness) / 100
    viewItem.line_total = agorot(line.faceValue) / 100
  }

  const itemCount = viewItems.reduce((sum, item) => sum + item.quantity, 0)

  return {
    id: cartId,
    items: viewItems,
    item_count: itemCount,
    subtotal: agorot(commission.customerPaysNow) / 100,
    platform_fee: agorot(commission.platformFee) / 100,
    supplier_due: agorot(commission.supplierDue) / 100,
    balance_due_at_business: agorot(commission.balanceDueAtBusiness) / 100,
  }
}
