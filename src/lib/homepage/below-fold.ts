import type { Coupon } from '@/components/CouponCard'
import { CATEGORY_TILE_IMAGES } from '@/lib/assets'
import { CacheLife, CacheTags } from '@/lib/cache/tags'
import { CATALOGUE_TAG } from '@/lib/catalogue-cache'
import { orderedByMenu } from '@/lib/category-page'
import {
  type DirectoryProductRow,
  type DirectorySupplierRow,
  MERCHANT_DIRECTORY_PRODUCT_COLUMNS,
  MERCHANT_DIRECTORY_SUPPLIER_COLUMNS,
  buildMerchantDirectory,
} from '@/lib/merchant-directory'
import { log } from '@/lib/observability/log'
import { POPULAR_SEARCHES_TAG } from '@/lib/search/empty-state'
import { readOptionalColumns } from '@/lib/supabase/optional-columns'
import { createCatalogueReadClient } from '@/lib/supabase/read-replica'
import { sanitizeOrTerm } from '@/lib/utils/search-escape'
import { cacheLife, cacheTag } from 'next/cache'
import {
  type BrandTile,
  type CategoryTile,
  type CategoryTileRow,
  type DealOfTheDay,
  type DealOfTheDayCandidate,
  HOME_BRAND_COUNT,
  HOME_CATEGORY_TILE_COUNT,
  HOME_POPULAR_SEARCH_COUNT,
  HOT_COUPON_COUNT,
  type PopularSearchChip,
  pickBrandTiles,
  pickCategoryTiles,
  pickDealOfTheDay,
  pickPopularSearches,
} from './below-fold-rules'

/**
 * The database reads behind the home page sections under the deals grid.
 *
 * CACHED, on the cookie-free catalogue client, for the reason `coupon-deals.ts`
 * and `category-page.ts` give: the home page is prerendered, and under
 * `cacheComponents` an uncached read outside a Suspense boundary fails the
 * build. A `'use cache'` read is computed at build time and refreshed every
 * two minutes under traffic (`CacheLife.home`, lib/cache/tags.ts; staled at
 * once by the database webhook through `CacheTags.home`),
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
  cacheLife(CacheLife.home)
  cacheTag(CATALOGUE_TAG, CacheTags.home)
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
  cacheLife(CacheLife.home)
  cacheTag(CATALOGUE_TAG, CacheTags.home)
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

/**
 * The columns pending migration 270 adds to `coupon_deals`, read on their own
 * through `readOptionalColumns` so a database without them answers the card
 * with no code instead of 42703 taking the whole section down.
 */
export const COUPON_270_COLUMNS = ['code'] as const
type Coupon270Row = { id: string; code: string | null }

export async function getHotCouponDeals(): Promise<Coupon[]> {
  'use cache'
  cacheLife(CacheLife.home)
  cacheTag(CATALOGUE_TAG, CacheTags.home)
  try {
    const supabase = createCatalogueReadClient()
    // A deal past its `valid_until` is not hot, it is over: the card's
    // countdown would open on "המבצע הסתיים". Unset deadlines stay in. The
    // timestamp is the cache entry's, refreshed with it (CacheLife.home).
    // `sanitizeOrTerm` because it lands in an `.or()` expression, where the
    // parameterized-queries gate rightly refuses a raw interpolation; an ISO
    // timestamp passes through it unchanged.
    const now = sanitizeOrTerm(new Date().toISOString())
    const { data, error } = await supabase
      .from('coupon_deals')
      .select(
        'id, title_he, business_name, original_price, platform_price, discount_percentage, location_he, image_url, valid_until',
      )
      .eq('status', 'active')
      .is('deleted_at', null)
      .or(`valid_until.is.null,valid_until.gt.${now}`)
      .order('discount_percentage', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(HOT_COUPON_COUNT)
    if (error) {
      log.warn('homepage.hot_coupons_read_failed', { reason: error.message })
      return []
    }
    const rows = (data ?? []) as Coupon[]
    // Its own try: a failed code read costs the cards their copy button, not
    // the section. `readOptionalColumns` already maps 42703 to an empty map.
    let codes = new Map<string, Coupon270Row>()
    try {
      const probe = (select: string, ids: string[]) =>
        createCatalogueReadClient().from('coupon_deals').select(select).in('id', ids) as never
      codes = await readOptionalColumns<Coupon270Row>(
        probe,
        COUPON_270_COLUMNS,
        rows.map((r) => r.id),
        'hot coupons',
        'apply migrations/pending/270_coupon_deals_code.sql. Cards show no copy-code button until then.',
      )
    } catch (error) {
      log.warn('homepage.hot_coupons_code_read_failed', {
        reason: error instanceof Error ? error.message : 'unknown',
      })
    }
    return rows.map((row) => ({ ...row, code: codes.get(row.id)?.code ?? null }))
  } catch (error) {
    log.warn('homepage.hot_coupons_read_threw', {
      reason: error instanceof Error ? error.message : 'unknown',
    })
    return []
  }
}

/**
 * The promoted search terms for the home page chips (STEP 08). Same table and
 * same predicate as lib/search/popular.ts, on the cookie-free catalogue client
 * instead of the request client, because this read is inside the static
 * shell: the page is prerendered and a cookie read here would turn it dynamic.
 * The table is world-readable by policy (118), so anon RLS answers it.
 * Tagged so the admin editor can refresh it on save.
 */
export async function getHomePopularSearches(): Promise<PopularSearchChip[]> {
  'use cache'
  cacheLife(CacheLife.home)
  cacheTag(POPULAR_SEARCHES_TAG, CacheTags.home)
  try {
    const supabase = createCatalogueReadClient()
    const { data, error } = await supabase
      .from('popular_searches')
      .select('term, target_url')
      .eq('is_active', true)
      .order('position', { ascending: true })
      .order('term', { ascending: true })
      .limit(HOME_POPULAR_SEARCH_COUNT * 2)
    if (error) {
      log.warn('homepage.popular_searches_read_failed', { reason: error.message })
      return []
    }
    return pickPopularSearches(
      (data ?? []) as { term: string; target_url: string | null }[],
      HOME_POPULAR_SEARCH_COUNT,
    )
  } catch (error) {
    log.warn('homepage.popular_searches_read_threw', {
      reason: error instanceof Error ? error.message : 'unknown',
    })
    return []
  }
}

/**
 * The brands row (UX11): the merchant directory's entries, as tiles.
 *
 * THE SAME TWO READS `/merchants` MAKES, through the same column constants
 * and the same pure builder (`buildMerchantDirectory`), so a merchant is the
 * same merchant on both pages: same count, same order, same logo. What
 * differs is the contract. `loadMerchantDirectory` is `orFail`, which is right
 * for a page whose whole content it is; here a failed read is logged and the
 * row renders nothing, like every reader above. Cached under `CacheLife.home`
 * with the home tag, and under `productList` too, because a product moving in
 * or out of a supplier is what changes its tile.
 */
export async function getHomeBrands(): Promise<BrandTile[]> {
  'use cache'
  cacheLife(CacheLife.home)
  cacheTag(CATALOGUE_TAG, CacheTags.home, CacheTags.productList)
  try {
    const supabase = createCatalogueReadClient()
    const [suppliersRead, productsRead] = await Promise.all([
      supabase
        .from('suppliers')
        .select(MERCHANT_DIRECTORY_SUPPLIER_COLUMNS)
        .eq('status', 'active')
        .is('deleted_at', null)
        .limit(500),
      supabase
        .from('products')
        .select(MERCHANT_DIRECTORY_PRODUCT_COLUMNS)
        .eq('status', 'active')
        .is('deleted_at', null)
        .not('supplier_id', 'is', null)
        .limit(5000),
    ])
    if (suppliersRead.error) {
      log.warn('homepage.brands_suppliers_read_failed', { reason: suppliersRead.error.message })
      return []
    }
    if (productsRead.error) {
      log.warn('homepage.brands_products_read_failed', { reason: productsRead.error.message })
      return []
    }
    const entries = buildMerchantDirectory(
      (suppliersRead.data ?? []) as DirectorySupplierRow[],
      (productsRead.data ?? []) as DirectoryProductRow[],
    )
    return pickBrandTiles(entries, HOME_BRAND_COUNT)
  } catch (error) {
    log.warn('homepage.brands_read_threw', {
      reason: error instanceof Error ? error.message : 'unknown',
    })
    return []
  }
}
