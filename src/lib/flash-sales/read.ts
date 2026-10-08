import 'server-only'

import { CacheLife, CacheTags } from '@/lib/cache/tags'
import { CATALOGUE_TAG } from '@/lib/catalogue-cache'
import { type FlashSale, isMissingFlashSchema, pickHomeFlashSale } from '@/lib/flash-sales/rules'
import { firstImage } from '@/lib/homepage/below-fold-rules'
import { log } from '@/lib/observability/log'
import { createPublicClient } from '@/lib/supabase/anon'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cacheLife, cacheTag } from 'next/cache'

/**
 * Reads of `flash_sales` and `flash_sale_claims` (STEP 61).
 *
 * THE ANON KEY ONLY, and that is a gate, not a habit. This module sits in
 * the home page's and the product page's import tree, and
 * `catalogue-render-path.test.ts` requires that tree to reach no
 * cookie-reading client, or the pages stop being cacheable. The policy
 * exposes active rows only, which is exactly the set the banner, the sale
 * page and the product page may know about. The two reads that need a
 * person live next door: `holds.ts` (the visitor's own claims, through their
 * session) and `status.ts` (the waiting room's poll, on the service role).
 *
 * Before migration 266 is applied none of these tables exist. 42P01 / PGRST205
 * reads as "no flash sale", logged once at warn, and every surface renders
 * exactly as it did before this step. Any other error is also "no flash
 * sale": a banner that fails to load must not fail the home page.
 */

export type FlashSaleProduct = {
  name_he: string
  slug: string
  image_url: string | null
  /** The product's ordinary shekel price, for the "was" line when the sale names none. */
  kenyon_price: number | null
  full_price: number | null
  stock_quantity: number | null
  status: string | null
}

export type FlashSaleView = FlashSale & {
  product: FlashSaleProduct | null
  /** Units still open at the flash price, or null when the RPC is unavailable. */
  remaining: number | null
}

type ProductEmbed = {
  name_he: string
  slug: string
  images: unknown
  kenyon_price: number | string | null
  full_price: number | string | null
  stock_quantity: number | null
  status: string | null
}

type SaleRow = {
  id: string
  product_id: string
  name_he: string
  price_agorot: number | string
  reference_agorot: number | string | null
  allocation: number | string
  max_per_claim: number | string
  hold_minutes: number | string
  starts_at: string
  ends_at: string
  is_active: boolean
  products: ProductEmbed | ProductEmbed[] | null
}

export const FLASH_SALE_SELECT =
  'id, product_id, name_he, price_agorot, reference_agorot, allocation, max_per_claim, hold_minutes, starts_at, ends_at, is_active, products(name_he, slug, images, kenyon_price, full_price, stock_quantity, status)'

const int = (v: number | string | null | undefined): number => Math.trunc(Number(v ?? 0))
const num = (v: number | string | null | undefined): number | null =>
  v == null || Number.isNaN(Number(v)) ? null : Number(v)

/** Exported for the tests: the embed shape to the view shape. */
export function flashSaleFromRow(row: SaleRow): Omit<FlashSaleView, 'remaining'> {
  const embed = Array.isArray(row.products) ? (row.products[0] ?? null) : row.products
  return {
    id: row.id,
    product_id: row.product_id,
    name_he: row.name_he,
    price_agorot: int(row.price_agorot),
    reference_agorot: row.reference_agorot == null ? null : int(row.reference_agorot),
    allocation: int(row.allocation),
    max_per_claim: Math.max(1, int(row.max_per_claim)),
    hold_minutes: Math.max(1, int(row.hold_minutes)),
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    is_active: Boolean(row.is_active),
    product: embed
      ? {
          name_he: embed.name_he,
          slug: embed.slug,
          image_url: firstImage(embed.images),
          kenyon_price: num(embed.kenyon_price),
          full_price: num(embed.full_price),
          stock_quantity: embed.stock_quantity ?? null,
          status: embed.status ?? null,
        }
      : null,
  }
}

let warnedAbsent = false

/** One warning per process for the absent schema, not one per page view. */
export function noteFlashSchemaAbsent(where: string): void {
  if (warnedAbsent) return
  warnedAbsent = true
  log.warn('flash_sales.schema_absent', { where, hint: 'migration 266 not applied' })
}

export function noSales(error: { code?: string; message: string }, where: string): null {
  if (isMissingFlashSchema(error)) noteFlashSchemaAbsent(where)
  else log.warn('flash_sales.read_failed', { where, reason: error.message })
  return null
}

async function readRemaining(
  client: SupabaseClient,
  saleId: string,
  where: string,
): Promise<number | null> {
  const { data, error } = await client.rpc(
    'flash_sale_remaining' as never,
    {
      p_sale: saleId,
    } as never,
  )
  if (error) {
    noSales(error, where)
    return null
  }
  return data == null ? null : Math.max(0, Math.trunc(Number(data)))
}

/**
 * The sale the home banner shows, or null. Cached with the home page
 * (`CacheLife.home`, two minutes under traffic, staled by the catalogue tag
 * every admin write touches). The `remaining` figure is therefore up to two
 * minutes old on the banner; the sale page polls the live number.
 */
export async function getHomeFlashSale(): Promise<FlashSaleView | null> {
  'use cache'
  cacheLife(CacheLife.home)
  cacheTag(CATALOGUE_TAG, CacheTags.home)
  try {
    const supabase = createPublicClient()
    const now = new Date()
    const { data, error } = await supabase
      .from('flash_sales' as never)
      .select(FLASH_SALE_SELECT)
      .eq('is_active', true)
      .gt('ends_at', now.toISOString())
      .order('starts_at', { ascending: true })
      .limit(20)
    if (error) return noSales(error, 'home')
    const sales = ((data as unknown as SaleRow[] | null) ?? []).map(flashSaleFromRow)
    const pick = pickHomeFlashSale(sales, now)
    if (!pick) return null
    if (!pick.product || pick.product.status !== 'active') return null
    const remaining = await readRemaining(supabase, pick.id, 'home.remaining')
    return { ...pick, remaining }
  } catch (error) {
    log.warn('flash_sales.home_read_threw', {
      reason: error instanceof Error ? error.message : 'unknown',
    })
    return null
  }
}

/** One active sale by id, with its product and the live remaining count. Uncached. */
export async function loadFlashSale(id: string): Promise<FlashSaleView | null> {
  try {
    const supabase = createPublicClient()
    const { data, error } = await supabase
      .from('flash_sales' as never)
      .select(FLASH_SALE_SELECT)
      .eq('id', id)
      .maybeSingle()
    if (error) return noSales(error, 'by_id')
    if (!data) return null
    const sale = flashSaleFromRow(data as unknown as SaleRow)
    const remaining = await readRemaining(supabase, sale.id, 'by_id.remaining')
    return { ...sale, remaining }
  } catch (error) {
    log.warn('flash_sales.by_id_read_threw', {
      reason: error instanceof Error ? error.message : 'unknown',
    })
    return null
  }
}

/**
 * The live or upcoming sale on one product, for the product page's notice.
 * Cached with the product page under the catalogue tag.
 */
export async function getFlashSaleForProduct(productId: string): Promise<FlashSaleView | null> {
  'use cache'
  cacheLife(CacheLife.home)
  cacheTag(CATALOGUE_TAG)
  try {
    const supabase = createPublicClient()
    const now = new Date()
    const { data, error } = await supabase
      .from('flash_sales' as never)
      .select(FLASH_SALE_SELECT)
      .eq('product_id', productId)
      .eq('is_active', true)
      .gt('ends_at', now.toISOString())
      .order('starts_at', { ascending: true })
      .limit(5)
    if (error) return noSales(error, 'product')
    const sales = ((data as unknown as SaleRow[] | null) ?? []).map(flashSaleFromRow)
    const pick = pickHomeFlashSale(sales, now)
    if (!pick) return null
    const remaining = await readRemaining(supabase, pick.id, 'product.remaining')
    return { ...pick, remaining }
  } catch (error) {
    log.warn('flash_sales.product_read_threw', {
      reason: error instanceof Error ? error.message : 'unknown',
    })
    return null
  }
}
