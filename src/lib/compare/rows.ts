import { discountBp } from '@/lib/catalogue/discount-sort'
import { type Agorot, parseIls } from '@/lib/money'

/**
 * What the comparison table says about one product, derived once.
 *
 * Pure, so the table is a unit test away and the page only lays it out.
 * Amounts are integer agorot from the moment they leave the catalogue's
 * shekel columns; the saving is a subtraction of two integers and the
 * discount is the same basis-point figure the discount sort orders by, so the
 * table, the card badge and the sort cannot disagree about which deal is
 * deeper.
 */

export type CompareProduct = {
  id: string
  slug: string
  name_he: string
  kenyon_price: number | string | null
  full_price: number | string | null
  images: unknown
  stock_quantity: number | null
  short_description_he: string | null
  coupon_expiry_days: number | null
  category: { name_he: string; slug: string } | null
}

export type CompareColumn = {
  id: string
  slug: string
  name: string
  image: string | null
  priceAgorot: Agorot | null
  fullPriceAgorot: Agorot | null
  /** Full price minus price, when the product is actually cheaper. */
  savingAgorot: Agorot | null
  /** Whole percent off the full price, rounded down; null with no discount. */
  discountPercent: number | null
  category: { name_he: string; slug: string } | null
  inStock: boolean
  description: string | null
  voucherDays: number | null
}

function toAgorot(value: number | string | null): Agorot | null {
  if (value === null) return null
  try {
    const amount = parseIls(typeof value === 'number' ? value.toFixed(2) : value)
    return amount > 0 ? amount : null
  } catch {
    return null
  }
}

function firstImage(images: unknown): string | null {
  return Array.isArray(images) && typeof images[0] === 'string' ? (images[0] as string) : null
}

export function toCompareColumn(product: CompareProduct): CompareColumn {
  const price = toAgorot(product.kenyon_price)
  const full = toAgorot(product.full_price)
  const cheaper = price !== null && full !== null && full > price
  const bp = cheaper ? discountBp(product.full_price, product.kenyon_price) : 0
  const days = product.coupon_expiry_days
  return {
    id: product.id,
    slug: product.slug,
    name: product.name_he,
    image: firstImage(product.images),
    priceAgorot: price,
    fullPriceAgorot: cheaper ? full : null,
    savingAgorot: cheaper ? ((full - price) as Agorot) : null,
    discountPercent: bp > 0 ? Math.floor(bp / 100) : null,
    category: product.category,
    // Null stock means "not tracked", which is in stock: the cart's reading.
    inStock: product.stock_quantity === null || product.stock_quantity > 0,
    description: product.short_description_he?.trim() || null,
    voucherDays: days !== null && Number.isInteger(days) && days > 0 ? days : null,
  }
}

/** The id of the cheapest priced product, or null when fewer than two have a price. */
export function cheapestId(columns: readonly CompareColumn[]): string | null {
  const priced = columns.filter((c) => c.priceAgorot !== null)
  if (priced.length < 2) return null
  let best = priced[0] as CompareColumn
  for (const column of priced) {
    if ((column.priceAgorot as number) < (best.priceAgorot as number)) best = column
  }
  // A tie has no winner: marking one of two equal prices would be arbitrary.
  const ties = priced.filter((c) => c.priceAgorot === best.priceAgorot).length
  return ties === 1 ? best.id : null
}
