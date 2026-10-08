import {
  resolveStorefrontProductType,
  storefrontProductTypeLabel,
} from '@/lib/commerce/product-type'
import { discountPercent } from '@/lib/discount-percent'
import { isInStock } from '@/lib/wishlist/alerts'

/**
 * The shape `/compare` renders per column, and the pure mapping from a
 * catalogue row onto it. Kept out of the server action so the mapping is
 * tested on plain objects and the action only has to be tested for what it
 * refuses and in what order it answers.
 */

export interface CompareViewItem {
  productId: string
  name: string
  /** Null when the product is gone or inactive: the column renders no link. */
  slug: string | null
  image: string | null
  /** Shekels as the catalogue stores them; formatted by `shekelsFromIlsRounded`. */
  priceIls: number | null
  fullPriceIls: number | null
  /** Whole percent off `fullPriceIls`, null when there is no real discount. */
  discountPercent: number | null
  /** Active, undeleted, and not sold out: the product can go to the cart. */
  available: boolean
  soldOut: boolean
  typeLabel: string
  categoryName: string | null
  categorySlug: string | null
  supplierName: string | null
  brand: string | null
  sku: string | null
  city: string | null
  cashbackPercent: number | null
  requiresShipping: boolean
  shortDescription: string | null
  highlights: string[]
  /** The product's own attribute pairs, label first, as the admin typed them. */
  attributes: { label: string; value: string }[]
}

export interface CompareProductRow {
  id: string
  name_he: string | null
  slug: string | null
  images: unknown
  kenyon_price: number | string | null
  price_ils: number | string | null
  full_price: number | string | null
  stock_quantity: number | null
  status: string | null
  deleted_at: string | null
  type: string | null
  is_coupon_enabled: boolean | null
  brand: string | null
  sku: string | null
  city: string | null
  cashback_percent: number | string | null
  requires_shipping: boolean | null
  short_description_he: string | null
  highlights: unknown
  attributes: unknown
  category:
    | { name_he: string | null; slug: string | null }
    | { name_he: string | null; slug: string | null }[]
    | null
  supplier: { name: string | null } | { name: string | null }[] | null
}

function firstImage(images: unknown): string | null {
  if (!Array.isArray(images)) return null
  const first = images.find((src): src is string => typeof src === 'string' && src.length > 0)
  return first ?? null
}

function one<T>(value: T | T[] | null): T | null {
  if (value === null || value === undefined) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

function num(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null
  const n = typeof value === 'string' ? Number(value) : value
  return Number.isFinite(n) ? n : null
}

/** `products.highlights`: an array of strings by schema; anything else is empty. */
export function highlightsOf(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((h): h is string => typeof h === 'string' && h.trim().length > 0)
    .map((h) => h.trim())
}

/**
 * `products.attributes` is untyped JSON and two shapes exist in the data:
 * an object (`{"צבע": "שחור"}`) and an array of `{label|name, value}`. Both
 * become ordered label/value pairs; a value that is not a scalar is skipped,
 * since a nested object in a table cell is noise, not information.
 */
export function attributesOf(raw: unknown): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = []
  const push = (label: unknown, value: unknown) => {
    if (typeof label !== 'string' || label.trim() === '') return
    if (typeof value === 'string') {
      if (value.trim() !== '') out.push({ label: label.trim(), value: value.trim() })
      return
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      out.push({ label: label.trim(), value: String(value) })
    }
  }
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (!entry || typeof entry !== 'object') continue
      const e = entry as Record<string, unknown>
      push(e.label ?? e.name ?? e.key, e.value)
    }
    return out
  }
  if (raw && typeof raw === 'object') {
    for (const [label, value] of Object.entries(raw as Record<string, unknown>)) push(label, value)
  }
  return out
}

export function toCompareViewItem(row: CompareProductRow): CompareViewItem {
  const live = row.deleted_at === null && row.status === 'active'
  const inStock = isInStock(row.stock_quantity, row.status)
  const category = one(row.category)
  const supplier = one(row.supplier)
  const price = num(row.kenyon_price) ?? num(row.price_ils)
  const full = num(row.full_price)
  const hasDiscount = price !== null && full !== null && full > price
  return {
    productId: row.id,
    name: row.name_he ?? 'מוצר',
    slug: live ? (row.slug ?? null) : null,
    image: firstImage(row.images),
    priceIls: price,
    fullPriceIls: hasDiscount ? full : null,
    discountPercent: hasDiscount ? discountPercent(price, full) : null,
    available: live && inStock,
    soldOut: live && !inStock,
    typeLabel: storefrontProductTypeLabel(
      resolveStorefrontProductType({ type: row.type, is_coupon_enabled: row.is_coupon_enabled }),
    ),
    categoryName: category?.name_he ?? null,
    categorySlug: category?.slug ?? null,
    supplierName: supplier?.name ?? null,
    brand: row.brand?.trim() || null,
    sku: row.sku?.trim() || null,
    city: row.city?.trim() || null,
    cashbackPercent: num(row.cashback_percent),
    requiresShipping: row.requires_shipping === true,
    shortDescription: row.short_description_he?.trim() || null,
    highlights: highlightsOf(row.highlights),
    attributes: attributesOf(row.attributes),
  }
}
