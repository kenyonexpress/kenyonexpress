import 'server-only'

import type { Product } from '@/components/ProductCard'
import { CacheLife, CacheTags } from '@/lib/cache/tags'
import { CATALOGUE_TAG } from '@/lib/catalogue-cache'
import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import { createCatalogueReadClient } from '@/lib/supabase/read-replica'
import { cacheLife, cacheTag } from 'next/cache'
import {
  CO_VIEW_QUERY,
  VIEWED_BY_VISITOR_QUERY,
  isPostHogQueryConfigured,
  queryHogql,
  rowsAs,
} from './posthog-query'
import { BASKET_WINDOW_DAYS, type PriceBand, sanitizeSeedIds } from './rules'

/**
 * The reads behind `lib/recommendations`. Four readers, each one query, each
 * behind `'use cache'`, none of which can throw into a page.
 *
 * TWO CLIENTS, AND WHICH ONE EACH READER USES.
 *
 * - The CATALOGUE client (anon, cookie-free, read replica when configured) for
 *   anything a shopper could read anyway: product rows by id, products in a
 *   price band. Same contract as `related-products.ts`.
 * - The ADMIN client for the two aggregate sources, because both tables are
 *   private by RLS: `order_items` (whose orders were paid) and
 *   `analytics_events` (the first-party `view_product` stream). The reader
 *   returns `(basket, product_id)` pairs and nothing else: no order ids, no
 *   amounts, no session or user ids survive past this module. The matrix
 *   built from them says "these two products were in the same basket at
 *   least twice", which is the whole of what reaches a shopper.
 *
 * POSTHOG FIRST, FIRST-PARTY SECOND. "Viewed together" is specified on
 * PostHog's `view_item` events. The HogQL reader runs when `POSTHOG_API_KEY`
 * and `POSTHOG_PROJECT_ID` are set; when they are not (every deployment on
 * 2026-10-08) or the query fails, the same baskets are read off
 * `analytics_events`, which receives the same product view from the same
 * mount (`ViewTracker` fires both). The fallback is a degraded copy of the
 * same signal, not a different feature.
 *
 * WHAT A CACHED FUNCTION RETURNS. Plain arrays of strings. The matrix is a
 * Map and is rebuilt from the rows by the caller: the cache serialises what
 * it stores, and a row list is the cheapest honest shape.
 */

export type BasketRow = { key: string; productId: string }

const CARD_SELECT =
  'id, slug, name_he, kenyon_price, full_price, kenyon_price_agorot, images, stock_quantity, category_id, categories!products_category_id_fkey(name_he, slug)'

type CardRow = {
  id: string
  slug: string
  name_he: string
  kenyon_price: number | null
  full_price: number | null
  kenyon_price_agorot: number | null
  images: unknown
  stock_quantity: number | null
  category_id: string | null
  categories: { name_he: string; slug: string } | { name_he: string; slug: string }[] | null
}

/** A card plus the integer price the similar-price ranking compares on. */
export type RecommendedProduct = Product & { priceAgorot: number | null; categoryId: string | null }

function toRecommended(r: CardRow): RecommendedProduct {
  const cat = Array.isArray(r.categories) ? (r.categories[0] ?? null) : r.categories
  return {
    id: r.id,
    slug: r.slug,
    name_he: r.name_he,
    kenyon_price: r.kenyon_price,
    full_price: r.full_price,
    images: r.images,
    stock_quantity: r.stock_quantity,
    category: cat,
    categoryId: r.category_id ?? null,
    priceAgorot: Number.isInteger(r.kenyon_price_agorot) ? r.kenyon_price_agorot : null,
  }
}

function sinceIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString()
}

function reason(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown'
}

/**
 * Baskets of products viewed by the same visitor on the same day. PostHog
 * when it can be queried, `analytics_events` otherwise. Empty on failure.
 */
export async function loadViewedTogetherRows(): Promise<BasketRow[]> {
  'use cache'
  cacheLife(CacheLife.recommendations)
  cacheTag(CATALOGUE_TAG)
  try {
    if (isPostHogQueryConfigured()) {
      const result = await queryHogql(CO_VIEW_QUERY, { days: BASKET_WINDOW_DAYS })
      if (result) {
        return rowsAs(result, 'basket', 'item_id').map((r) => ({
          key: r.first,
          productId: r.second,
        }))
      }
      // A configured PostHog that failed falls through to first-party, logged
      // by queryHogql; the strip must not go blank over a vendor hiccup.
    }
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('analytics_events')
      .select('session_id, props')
      .eq('event_name', 'view_product')
      .gte('occurred_at', sinceIso(BASKET_WINDOW_DAYS))
      .order('occurred_at', { ascending: false })
      .limit(5000)
    if (error) {
      log.warn('recommendations.first_party_views_failed', { reason: error.message })
      return []
    }
    const rows: BasketRow[] = []
    for (const row of (data ?? []) as { session_id: string; props: unknown }[]) {
      const props = row.props as { product_id?: unknown } | null
      const productId = props && typeof props.product_id === 'string' ? props.product_id : null
      if (productId && row.session_id) rows.push({ key: row.session_id, productId })
    }
    return rows
  } catch (error) {
    log.warn('recommendations.views_threw', { reason: reason(error) })
    return []
  }
}

/**
 * Baskets of products in the same PAID order. Pending, failed and refunded
 * orders are not evidence of anything bought: `paid_at` is the same column
 * the revenue cohorts key on (server/analytics/retention-cohorts.ts).
 */
export async function loadBoughtTogetherRows(): Promise<BasketRow[]> {
  'use cache'
  cacheLife(CacheLife.recommendations)
  cacheTag(CATALOGUE_TAG)
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('order_items')
      .select('order_id, product_id, orders!inner(paid_at)')
      .is('deleted_at', null)
      .not('product_id', 'is', null)
      .not('orders.paid_at', 'is', null)
      .gte('orders.paid_at', sinceIso(BASKET_WINDOW_DAYS))
      .limit(5000)
    if (error) {
      log.warn('recommendations.order_items_failed', { reason: error.message })
      return []
    }
    const rows: BasketRow[] = []
    for (const row of (data ?? []) as { order_id: string; product_id: string | null }[]) {
      if (row.product_id && row.order_id)
        rows.push({ key: row.order_id, productId: row.product_id })
    }
    return rows
  } catch (error) {
    log.warn('recommendations.order_items_threw', { reason: reason(error) })
    return []
  }
}

/**
 * Active products priced inside the band, excluding the seed. The ranking by
 * distance happens in `rules.ts`; this only fetches the band, generously, so
 * the ranking has something to choose from.
 */
export async function loadPriceBandCandidates(
  band: PriceBand,
  excludeId: string,
): Promise<RecommendedProduct[]> {
  'use cache'
  cacheLife(CacheLife.product)
  cacheTag(CATALOGUE_TAG, CacheTags.product(excludeId))
  try {
    const supabase = createCatalogueReadClient()
    const { data, error } = await supabase
      .from('products')
      .select(CARD_SELECT)
      .eq('status', 'active')
      .is('deleted_at', null)
      .neq('id', excludeId)
      .gte('kenyon_price_agorot', band.minAgorot)
      .lte('kenyon_price_agorot', band.maxAgorot)
      .order('kenyon_price_agorot', { ascending: true })
      .limit(24)
    if (error) {
      log.warn('recommendations.price_band_failed', { reason: error.message })
      return []
    }
    return ((data ?? []) as unknown as CardRow[]).map(toRecommended)
  } catch (error) {
    log.warn('recommendations.price_band_threw', { reason: reason(error) })
    return []
  }
}

/**
 * Card rows for a list of ids, active only, in the order asked for. Ids that
 * are gone (deleted, drafted, unknown) simply do not come back, which is how a
 * stale co-occurrence table degrades: silently, to fewer cards.
 */
export async function loadProductsByIds(ids: readonly string[]): Promise<RecommendedProduct[]> {
  'use cache'
  cacheLife(CacheLife.product)
  const clean = sanitizeSeedIds(ids)
  cacheTag(CATALOGUE_TAG, ...clean.map((id) => CacheTags.product(id)))
  if (clean.length === 0) return []
  try {
    const supabase = createCatalogueReadClient()
    const { data, error } = await supabase
      .from('products')
      .select(CARD_SELECT)
      .eq('status', 'active')
      .is('deleted_at', null)
      .in('id', clean)
    if (error) {
      log.warn('recommendations.products_by_id_failed', { reason: error.message })
      return []
    }
    const byId = new Map<string, RecommendedProduct>()
    for (const row of (data ?? []) as unknown as CardRow[]) byId.set(row.id, toRecommended(row))
    const ordered: RecommendedProduct[] = []
    for (const id of clean) {
      const p = byId.get(id)
      if (p) ordered.push(p)
    }
    return ordered
  } catch (error) {
    log.warn('recommendations.products_by_id_threw', { reason: reason(error) })
    return []
  }
}

/** How many of one visitor's recent products the personalised row seeds on. */
export const VISITOR_HISTORY_LIMIT = 12

/** How far back one visitor's history reaches. */
export const VISITOR_HISTORY_DAYS = 30

/**
 * One visitor's own recently viewed products from PostHog, newest first, or
 * an empty list when PostHog cannot be queried. Keyed per distinct id with a
 * short life (`CacheLife.personal`). The id is bound as a HogQL value and
 * never interpolated; it is also length-capped by the caller.
 */
export async function loadVisitorHistory(distinctId: string): Promise<string[]> {
  'use cache'
  cacheLife(CacheLife.personal)
  if (!distinctId || !isPostHogQueryConfigured()) return []
  const result = await queryHogql(VIEWED_BY_VISITOR_QUERY, {
    distinct_id: distinctId,
    days: VISITOR_HISTORY_DAYS,
    limit: VISITOR_HISTORY_LIMIT,
  })
  if (!result) return []
  const i = result.columns.indexOf('item_id')
  if (i < 0) return []
  return sanitizeSeedIds(result.results.map((row) => row[i]))
}
