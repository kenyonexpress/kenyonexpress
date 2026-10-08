import 'server-only'

import { CacheLife, CacheTags } from '@/lib/cache/tags'
import { CATALOGUE_TAG } from '@/lib/catalogue-cache'
import { authoredGuideFor } from '@/lib/category-guides/authored'
import {
  type CategoryGuide,
  type CategoryGuideRow,
  isMissingGuideSchema,
  resolveGuide,
} from '@/lib/category-guides/rules'
import { log } from '@/lib/observability/log'
import { createPublicClient } from '@/lib/supabase/anon'
import { cacheLife, cacheTag } from 'next/cache'

/**
 * The storefront's read of a category's buyer guide (STEP 65).
 *
 * THE ANON KEY ONLY, for the reason `category-banners/read.ts` gives: this
 * module is in the category page's import tree, and
 * `catalogue-render-path.test.ts` requires that tree to reach no
 * cookie-reading client, or the page stops being cacheable. The policy
 * exposes every row, published or not, and `resolveGuide` applies
 * `is_published` itself: an unpublished row hides the authored fallback
 * too, which a policy that filtered the row out could not express.
 *
 * Cached on the list profile under the category's tag, which every admin
 * save stales. Before migration 268 the table does not exist, and 42P01 /
 * PGRST205 reads as "no row", logged once at warn, so the page renders the
 * authored guide. Any other error is also "no row": a guide that fails to
 * load must not fail the category page.
 */

export const GUIDE_SELECT = 'category_id, title_he, body_md, is_published'

let warnedAbsent = false

function noteSchemaAbsent(): void {
  if (warnedAbsent) return
  warnedAbsent = true
  log.warn('category_guides.schema_absent', { hint: 'migration 268 not applied' })
}

/** The category's row, or null. Null on the absent table and on any error. */
export async function getCategoryGuideRow(categoryId: string): Promise<CategoryGuideRow | null> {
  'use cache'
  cacheLife(CacheLife.list)
  cacheTag(CATALOGUE_TAG, CacheTags.category(categoryId))
  try {
    const { data, error } = await createPublicClient()
      .from('category_guides' as never)
      .select(GUIDE_SELECT)
      .eq('category_id', categoryId)
      .maybeSingle()
    if (error) {
      if (isMissingGuideSchema(error)) noteSchemaAbsent()
      else log.warn('category_guides.read_failed', { reason: error.message })
      return null
    }
    const row = data as unknown as CategoryGuideRow | null
    if (!row || typeof row.body_md !== 'string') return null
    return {
      category_id: row.category_id,
      title_he: row.title_he ?? null,
      body_md: row.body_md,
      is_published: Boolean(row.is_published),
    }
  } catch (error) {
    log.warn('category_guides.read_threw', {
      reason: error instanceof Error ? error.message : 'unknown',
    })
    return null
  }
}

/** The guide the category page shows: the row, else the authored text for the slug, else null. */
export async function getCategoryGuide(category: {
  id: string
  slug: string
}): Promise<CategoryGuide | null> {
  const row = await getCategoryGuideRow(category.id)
  return resolveGuide(row, authoredGuideFor(category.slug), category.id)
}
