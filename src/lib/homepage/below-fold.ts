import type { Coupon } from '@/components/CouponCard'
import { CATEGORY_TILE_IMAGES } from '@/lib/assets'
import { CATALOGUE_TAG } from '@/lib/catalogue-cache'
import { orderedByMenu } from '@/lib/category-page'
import { log } from '@/lib/observability/log'
import { createCatalogueReadClient } from '@/lib/supabase/read-replica'
import { cacheLife, cacheTag } from 'next/cache'
import {
  type CategoryTile,
  type CategoryTileRow,
  type DealOfTheDay,
  type DealOfTheDayCandidate,
  HOME_CATEGORY_TILE_COUNT,
  HOT_COUPON_COUNT,
  pickCategoryTiles,
  pickDealOfTheDay,
} from './below-fold-rules'

/**
 * The database reads behind the home page sections under the deals grid.
 *
 * CACHED, on the cookie-free catalogue client, for the reason `coupon-deals.ts`
 * and `category-page.ts` give: the home page is prerendered, and under
 * `cacheComponents` an uncached read outside a Suspense boundary fails the
 * build. A `'use cache'` read is computed at build time and refreshed hourly,
 * so the sections are in the static shell and nothing streams in under the
 * visitor. `cacheLife` and `cacheTag` are written out in each function rather
 * than behind a helper, deliberately - see the note in `category-page.ts`.
 *
 * NEVER THROWS. `orFail` is right for a category page, where a failed read is
 * a 500 rather than a lie; here a failed read would take the whole home page
 * down over a section that sits under thirty-two product cards. Each reader
 * logs the failure and returns nothing, and the section renders nothing. This
 * is the rule `homepage/cms.ts` already follows for the hero.
 */

export async function getHomeCategoryTiles(): Promise<CategoryTile[]> {
  'use cache'
  cacheLife('hours')
  cacheTag(CATALOGUE_TAG)
  try {
    const supabase = createCatalogueReadClient()
    const { data, error } = await orderedByMenu(
      supabase
        .from('categories')
        .select('slug, name_he, image_url')
        .eq('is_active', true)
        .is('parent_id', null)
        .is('deleted_at', null),
    )
    if (error) {
      log.warn('homepage.categories_read_failed', { reason: error.message })
      return []
    }
    return pickCategoryTiles(
      (data ?? []) as CategoryTileRow[],
      CATEGORY_TILE_IMAGES,
      HOME_CATEGORY_TILE_COUNT,
    )
  } catch (error) {
    log.warn('homepage.categories_read_threw', {
      reason: error instanceof Error ? error.message : 'unknown',
    })
    return []
  }
}

type DealRow = Omit<DealOfTheDayCandidate, 'category'> & {
  categories: { name_he: string; slug: string } | { name_he: string; slug: string }[] | null
}

export async function getDealOfTheDay(): Promise<DealOfTheDay | null> {
  'use cache'
  cacheLife('hours')
  cacheTag(CATALOGUE_TAG)
  try {
    const supabase = createCatalogueReadClient()
    // The whole active catalogue, ranked in code: `rankDeals` is the one
    // definition of "a deal" (the cron journals the same set), and the table
    // is tens of rows, not thousands.
    const { data, error } = await supabase
      .from('products')
      .select(
        'id, slug, name_he, status, stock_quantity, kenyon_price_agorot, full_price_agorot, images, categories!products_category_id_fkey(name_he, slug)',
      )
      .eq('status', 'active')
      .is('deleted_at', null)
    if (error) {
      log.warn('homepage.deal_of_the_day_read_failed', { reason: error.message })
      return null
    }
    const candidates: DealOfTheDayCandidate[] = ((data ?? []) as DealRow[]).map((row) => {
      const { categories, ...rest } = row
      const category = Array.isArray(categories) ? (categories[0] ?? null) : categories
      return { ...rest, category }
    })
    return pickDealOfTheDay(candidates)
  } catch (error) {
    log.warn('homepage.deal_of_the_day_read_threw', {
      reason: error instanceof Error ? error.message : 'unknown',
    })
    return null
  }
}

export async function getHotCouponDeals(): Promise<Coupon[]> {
  'use cache'
  cacheLife('hours')
  cacheTag(CATALOGUE_TAG)
  try {
    const supabase = createCatalogueReadClient()
    const { data, error } = await supabase
      .from('coupon_deals')
      .select(
        'id, title_he, business_name, original_price, platform_price, discount_percentage, location_he, image_url',
      )
      .eq('status', 'active')
      .is('deleted_at', null)
      .order('discount_percentage', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(HOT_COUPON_COUNT)
    if (error) {
      log.warn('homepage.hot_coupons_read_failed', { reason: error.message })
      return []
    }
    return (data ?? []) as Coupon[]
  } catch (error) {
    log.warn('homepage.hot_coupons_read_threw', {
      reason: error instanceof Error ? error.message : 'unknown',
    })
    return []
  }
}
