import 'server-only'

import { CacheLife, CacheTags } from '@/lib/cache/tags'
import { CATALOGUE_TAG } from '@/lib/catalogue-cache'
import {
  type BannerTheme,
  type CategoryBanner,
  isMissingBannerSchema,
  pickLiveBanner,
} from '@/lib/category-banners/rules'
import { log } from '@/lib/observability/log'
import { createPublicClient } from '@/lib/supabase/anon'
import { cacheLife, cacheTag } from 'next/cache'

/**
 * The storefront's read of `category_banners` (STEP 62).
 *
 * THE ANON KEY ONLY, and that is a gate, not a habit. This module sits in
 * the category page's import tree, and `catalogue-render-path.test.ts`
 * requires that tree to reach no cookie-reading client, or the page stops
 * being cacheable. The policy exposes active rows only, which is exactly the
 * set the page may know about.
 *
 * WHAT IS CACHED AND WHAT IS NOT. The category's active rows are cached on
 * the list profile under the category's own tag, which every admin save
 * stales. The CHOICE among them is made at request time by `pickLiveBanner`
 * with a fresh clock, so a banner scheduled for 09:00 appears on the first
 * request after 09:00, not when the cache entry happens to turn over. The
 * window is read from the cached rows; the clock is not.
 *
 * Before migration 267 is applied the table does not exist. 42P01 / PGRST205
 * reads as "no banner", logged once at warn, and the page renders exactly as
 * it did before this step. Any other error is also "no banner": a banner that
 * fails to load must not fail the category page.
 */

type Row = {
  id: string
  category_id: string
  title_he: string
  subtitle_he: string | null
  image_url: string
  image_alt_he: string
  cta_label_he: string | null
  cta_href: string | null
  theme: string | null
  starts_at: string | null
  ends_at: string | null
  priority: number | string | null
  is_active: boolean
}

export const BANNER_SELECT =
  'id, category_id, title_he, subtitle_he, image_url, image_alt_he, cta_label_he, cta_href, theme, starts_at, ends_at, priority, is_active'

/** Exported for the tests: the row shape to the typed shape. */
export function bannerFromRow(row: Row): CategoryBanner {
  const theme: BannerTheme = row.theme === 'dark' ? 'dark' : 'light'
  const hasCta = Boolean(row.cta_label_he && row.cta_href)
  return {
    id: row.id,
    category_id: row.category_id,
    title_he: row.title_he,
    subtitle_he: row.subtitle_he?.trim() ? row.subtitle_he : null,
    image_url: row.image_url,
    image_alt_he: row.image_alt_he,
    cta_label_he: hasCta ? row.cta_label_he : null,
    cta_href: hasCta ? row.cta_href : null,
    theme,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    priority: Math.trunc(Number(row.priority ?? 0)) || 0,
    is_active: Boolean(row.is_active),
  }
}

let warnedAbsent = false

/** One warning per process for the absent schema, not one per page view. */
function noteSchemaAbsent(where: string): void {
  if (warnedAbsent) return
  warnedAbsent = true
  log.warn('category_banners.schema_absent', { where, hint: 'migration 267 not applied' })
}

/**
 * The category's active banners, cached. Every row the policy exposes for
 * the category, window included, so the caller can choose with its own
 * clock. Empty on any failure.
 */
export async function getCategoryBanners(categoryId: string): Promise<CategoryBanner[]> {
  'use cache'
  cacheLife(CacheLife.list)
  cacheTag(CATALOGUE_TAG, CacheTags.category(categoryId))
  try {
    const { data, error } = await createPublicClient()
      .from('category_banners' as never)
      .select(BANNER_SELECT)
      .eq('category_id', categoryId)
      .eq('is_active', true)
      .order('priority', { ascending: false })
      .limit(20)
    if (error) {
      if (isMissingBannerSchema(error)) noteSchemaAbsent('category')
      else log.warn('category_banners.read_failed', { where: 'category', reason: error.message })
      return []
    }
    return ((data as unknown as Row[] | null) ?? []).map(bannerFromRow)
  } catch (error) {
    log.warn('category_banners.read_threw', {
      reason: error instanceof Error ? error.message : 'unknown',
    })
    return []
  }
}

/** The one banner the category page shows right now, or null. */
export async function getLiveCategoryBanner(
  categoryId: string,
  now: Date = new Date(),
): Promise<CategoryBanner | null> {
  const banners = await getCategoryBanners(categoryId)
  return pickLiveBanner(banners, now)
}
