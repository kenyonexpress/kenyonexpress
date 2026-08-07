import type { CartStorageItem } from '@/lib/cart/types'
import { createPublicClient } from '@/lib/supabase/anon'
import {
  CASHBACK_PERCENT_CANDIDATES,
  COUPON_054_COLUMNS,
  type Coupon054Row,
  readFirstAvailableColumn,
  readOptionalColumns,
} from '@/lib/supabase/optional-columns'

/**
 * The catalogue read behind every priced cart.
 *
 * Lives here rather than in `src/server/actions/cart.ts` because that file is
 * `'use server'`, where every export has to be an async server action. Anything
 * that is not the shopper's own cart — the abandoned-cart cron, which prices a
 * cart nobody is looking at — needs the same rows, and pricing a cart a second
 * way is how the two answers drift.
 *
 * Always the anon client. The catalogue is public, and reading it through a key
 * that can also see every order is a blast radius bought for nothing.
 */
export async function loadCartProductData(items: CartStorageItem[]) {
  if (items.length === 0) return { products: [], variants: [] }

  const productIds = [...new Set(items.map((i) => i.product_id))]
  const variantIds = [...new Set(items.map((i) => i.variant_id).filter((id): id is string => !!id))]

  const catalogue = createPublicClient()

  // No cashback column here, under either name. 059 renames cashback_percent
  // to cashback_bp and moves it to basis points, and it is NOT applied to the
  // hosted project. Naming the wrong one fails the WHOLE select with 42703:
  // `products` comes back null and every cart line loses its name, its image
  // and its price, while the header still shows a correct item count because
  // the count comes from the carts row rather than from here. That failure is
  // in STATE for 2026-07-28, where it was then "fixed" to the other name, which
  // is the same bug facing the other way. It is read below from whichever
  // column exists, and a cart is not worth losing over a perk that defaults to
  // zero.
  const productSelect =
    'id, slug, name_he, type, kenyon_price, stock_quantity, status, deleted_at, images, is_coupon_enabled, platform_percent'

  const { data: products } = await catalogue
    .from('products')
    .select(productSelect)
    .in('id', productIds)

  // coupon_price_ils arrives with migration 054, which is not applied to every
  // deployment. Naming it above would fail the whole cart query with 42703 and
  // leave the shopper with an empty cart rather than an unpriced coupon line.
  const coupon054 = await readOptionalColumns<Coupon054Row>(
    (select, ids) => catalogue.from('products').select(select).in('id', ids) as never,
    COUPON_054_COLUMNS,
    productIds,
    'cart',
  )
  const cashback = await readFirstAvailableColumn<number>(
    (select, ids) => catalogue.from('products').select(select).in('id', ids) as never,
    CASHBACK_PERCENT_CANDIDATES,
    productIds,
    'cart cashback',
  )

  const pricedProducts = (products ?? []).map((p) => ({
    ...p,
    coupon_price_ils: coupon054.get(p.id)?.coupon_price_ils ?? null,
    // Normalised to percent here rather than in pricing.ts, so the pure pricing
    // module keeps speaking percent, which is what its invariants are written
    // in. 250 bp is 2.5 percent.
    cashback_percent: cashback.get(p.id) ?? null,
  }))

  let variants: {
    id: string
    product_id: string
    price: number | null
    price_modifier: number
    stock_quantity: number | null
    is_active: boolean
    deleted_at: string | null
  }[] = []

  if (variantIds.length > 0) {
    const { data } = await catalogue
      .from('product_variants')
      .select('id, product_id, price, price_modifier, stock_quantity, is_active, deleted_at')
      .in('id', variantIds)
    variants = data ?? []
  }

  return { products: pricedProducts, variants }
}
