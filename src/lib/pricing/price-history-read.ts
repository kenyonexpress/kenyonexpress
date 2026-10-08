import 'server-only'

import { CacheLife, CacheTags } from '@/lib/cache/tags'
import { CATALOGUE_TAG } from '@/lib/catalogue-cache'
import { log } from '@/lib/observability/log'
import { createCatalogueReadClient } from '@/lib/supabase/read-replica'
import { cacheLife, cacheTag } from 'next/cache'
import {
  CHART_WINDOW_DAYS,
  type DailyPoint,
  HISTORY_WINDOW_DAYS,
  type HistorySummary,
  type PriceHistoryRow,
  chartSeries,
  dailyLows,
  dayKeyOffset,
  summarizeHistory,
} from './price-history'
import { jerusalemDayKey } from './price-snapshot'

/**
 * The storefront's reads of `price_history` (193), cached (STEP 59).
 *
 * Both readers run on the cookie-free catalogue client: 193 grants SELECT on
 * the table to `anon`, so the storefront reads the same evidence a shopper
 * could read, and nothing here needs the service role. Both are `'use cache'`
 * under the product lifetime and the catalogue tag, the contract every other
 * reader on the product page keeps (`product-detail.ts`), so an admin price
 * edit refreshes the chart with the page.
 *
 * NEITHER READER THROWS. A chart or a badge is decoration on a page whose
 * reason to exist is the buy button; a failed read is logged and rendered as
 * "no history", the way `stock-live.ts` treats a missing scarcity line. The
 * cache does store that empty answer for the product lifetime, which is the
 * price of not taking the page down with it.
 *
 * "TODAY" IS READ INSIDE THE CACHE SCOPE. A `Date` read in the page body
 * would make the route dynamic under cacheComponents; inside `'use cache'` it
 * is part of the cached computation, and a summary is at most
 * `CacheLife.product.revalidate` seconds behind the Jerusalem midnight.
 */

type HistoryRowWithProduct = PriceHistoryRow & { product_id: string }

async function readRows(productIds: readonly string[]): Promise<HistoryRowWithProduct[]> {
  if (productIds.length === 0) return []
  const from = dayKeyOffset(jerusalemDayKey(), -HISTORY_WINDOW_DAYS)
  const supabase = createCatalogueReadClient()
  const { data, error } = await supabase
    .from('price_history' as never)
    .select('product_id, observed_on, price_agorot, status')
    .in('product_id', [...productIds])
    .gte('observed_on', from)
    .order('observed_on', { ascending: true })
    .limit(productIds.length * HISTORY_WINDOW_DAYS * 2)
  if (error) {
    log.warn('price_history.read_failed', { count: productIds.length, reason: error.message })
    return []
  }
  return (data ?? []) as unknown as HistoryRowWithProduct[]
}

/** Every row of one product inside the window, ascending by day. */
export async function loadPriceHistory(productId: string): Promise<PriceHistoryRow[]> {
  'use cache'
  cacheLife(CacheLife.product)
  cacheTag(CATALOGUE_TAG, CacheTags.product(productId))
  const rows = await readRows([productId])
  return rows.map(({ observed_on, price_agorot, status }) => ({
    observed_on,
    price_agorot,
    status,
  }))
}

export interface PriceHistoryView {
  /** Every observed sale day in the window, lowest price per day, ascending. */
  points: DailyPoint[]
  /** The points inside the chart window. */
  series: DailyPoint[]
  summary: HistorySummary
  /** The lowest price on any observed day, today included. */
  lowestEverAgorot: number
  /** The Jerusalem day the view was computed for. */
  today: string
}

/**
 * Everything the product page's history band renders, computed inside one
 * cache scope so the page body reads no clock. Null below two observed sale
 * days, which is the band's own "nothing to show" rule.
 */
export async function loadPriceHistoryView(productId: string): Promise<PriceHistoryView | null> {
  'use cache'
  cacheLife(CacheLife.product)
  cacheTag(CATALOGUE_TAG, CacheTags.product(productId))
  const today = jerusalemDayKey()
  const rows = await readRows([productId])
  const points = dailyLows(rows)
  if (points.length < 2) return null
  let lowestEverAgorot = (points[0] as DailyPoint).agorot
  for (const p of points) if (p.agorot < lowestEverAgorot) lowestEverAgorot = p.agorot
  return {
    points,
    series: chartSeries(points, today, CHART_WINDOW_DAYS),
    summary: summarizeHistory(rows, today),
    lowestEverAgorot,
    today,
  }
}

/**
 * The cached summary for a set of products, keyed by id. Ids are sorted and
 * de-duplicated first so two callers asking for the same grid in a different
 * order share one entry. A product with no rows has no key.
 */
export async function loadPriceSummaries(
  productIds: readonly string[],
): Promise<Record<string, HistorySummary>> {
  const ids = [...new Set(productIds)].sort()
  if (ids.length === 0) return {}
  return loadPriceSummariesCached(ids)
}

async function loadPriceSummariesCached(ids: string[]): Promise<Record<string, HistorySummary>> {
  'use cache'
  cacheLife(CacheLife.product)
  cacheTag(CATALOGUE_TAG)
  const today = jerusalemDayKey()
  const rows = await readRows(ids)
  const byProduct = new Map<string, PriceHistoryRow[]>()
  for (const row of rows) {
    const list = byProduct.get(row.product_id)
    const slim = {
      observed_on: row.observed_on,
      price_agorot: row.price_agorot,
      status: row.status,
    }
    if (list) list.push(slim)
    else byProduct.set(row.product_id, [slim])
  }
  const out: Record<string, HistorySummary> = {}
  for (const [id, list] of byProduct) out[id] = summarizeHistory(list, today)
  return out
}

/**
 * The grid helper: the same product rows back, each carrying its summary (or
 * null) under `priceHistory`, which is the optional field the two card
 * components read. One cached read for the whole grid.
 */
export async function attachPriceHistory<T extends { id: string }>(
  products: readonly T[],
): Promise<(T & { priceHistory: HistorySummary | null })[]> {
  const summaries = await loadPriceSummaries(products.map((p) => p.id))
  return products.map((p) => ({ ...p, priceHistory: summaries[p.id] ?? null }))
}
