import { CATALOGUE_TAG } from '@/lib/catalogue-cache'
import { log } from '@/lib/observability/log'
import { TABLE_MISSING, UNDEFINED_COLUMN, summarizeRatings } from '@/lib/reviews/reviews'
import type { RatingSummary } from '@/lib/reviews/reviews'
import { createPublicClient } from '@/lib/supabase/anon'
import { cacheLife, cacheTag } from 'next/cache'

/**
 * Review reads. Approved rows are world-readable by policy, so the public
 * (anon) client is the right reader for the product page -- it keeps the page
 * cacheable and proves the policy instead of bypassing it.
 *
 * COOKIE-FREE ON PURPOSE: this module renders inside the catalogue's cached
 * tree, which `catalogue-render-path.test.ts` keeps free of the cookie-reading
 * client. The per-session "can I review" read lives in the reviews server
 * ACTION (the walk's deliberate boundary), fetched by the client gate after
 * paint.
 *
 * Until pending/154 is applied the table does not exist (PGRST205). Every
 * reader here degrades to "no reviews", logged once per query shape, because a
 * storefront page must not 500 over a feature that is waiting on a human to
 * apply a migration.
 */

export interface ApprovedReview {
  id: string
  rating: number
  title: string | null
  body: string | null
  created_at: string
  /**
   * The supplier's public answer, or null.
   *
   * Requires 199. Until it is applied the column does not exist, and the select
   * below asks for it through the optional-column probe rather than by name --
   * naming a column this database lacks fails the WHOLE query with 42703 and
   * blanks the review list, which is the outage shape this codebase has already
   * shipped twice.
   */
  supplier_reply: string | null
  supplier_replied_at: string | null
}

export interface ProductReviews {
  reviews: ApprovedReview[]
  summary: RatingSummary | null
}

const NONE: ProductReviews = { reviews: [], summary: null }

/**
 * The list read, widest column set first.
 *
 * TWO MIGRATIONS ARE OPTIONAL HERE AND THEY LANDED AT DIFFERENT TIMES: `title`
 * ships in 189 and `supplier_reply`/`supplier_replied_at` in 199, so a
 * deployment can legitimately have neither, the first, or both. Naming a column
 * this database lacks fails the WHOLE select with 42703 -- which would empty a
 * list of real reviews to hide one optional field, an outage shape this
 * codebase has already shipped twice.
 *
 * A LADDER RATHER THAN A PROBE, because the sets are nested: each rung drops
 * the newest optional column and retries, so the answer is always the widest
 * set this database actually has. Ordered newest-migration-first, so a fully
 * migrated deployment succeeds on the first attempt and pays nothing.
 */
async function readList(
  supabase: ReturnType<typeof createPublicClient>,
  productId: string,
  limit: number,
) {
  const COLUMNS = [
    'id, rating, title, body, created_at, supplier_reply, supplier_replied_at',
    'id, rating, title, body, created_at',
    'id, rating, body, created_at',
  ]

  let result: Awaited<ReturnType<typeof run>> | null = null
  const run = (columns: string) =>
    supabase
      .from('reviews' as never)
      .select(columns)
      .eq('product_id', productId)
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(limit)

  for (const columns of COLUMNS) {
    result = await run(columns)
    if (result.error?.code !== UNDEFINED_COLUMN) return result
  }
  return result as NonNullable<typeof result>
}

export async function getProductReviews(productId: string, limit = 20): Promise<ProductReviews> {
  'use cache'
  cacheLife('hours')
  cacheTag(CATALOGUE_TAG)
  const supabase = createPublicClient()
  // Two reads on purpose: the summary folds EVERY approved rating (a truthful
  // aggregate cannot stop at a page boundary), the list is capped for display.
  // `limit 0` is a legitimate call -- "rating only, no list" for the JSON-LD.
  const [listResult, ratingsResult] = await Promise.all([
    limit > 0 ? readList(supabase, productId, limit) : Promise.resolve({ data: [], error: null }),
    supabase
      .from('reviews' as never)
      .select('rating')
      .eq('product_id', productId)
      .eq('status', 'approved'),
  ])

  if (ratingsResult.error) {
    if (ratingsResult.error.code !== TABLE_MISSING) {
      log.warn('reviews.read_failed', { productId, code: ratingsResult.error.code ?? null })
    }
    return NONE
  }

  const reviews = listResult.error
    ? []
    : ((listResult.data ?? []) as unknown as Partial<ApprovedReview>[]).map((row) => ({
        id: row.id ?? '',
        rating: row.rating ?? 0,
        title: row.title ?? null,
        body: row.body ?? null,
        created_at: row.created_at ?? '',
        supplier_reply: row.supplier_reply ?? null,
        supplier_replied_at: row.supplier_replied_at ?? null,
      }))
  const ratings = (ratingsResult.data ?? []) as unknown as { rating: number }[]
  return { reviews, summary: summarizeRatings(ratings.map((row) => row.rating)) }
}

/**
 * Approved-rating summaries for a batch of products, keyed by product id.
 *
 * ONE QUERY FOR A WHOLE GRID. A category page renders 24 cards; asking
 * `getProductReviews` per card is 24 cached entries and 24 round trips on a
 * miss, to paint at most 24 short strings. This reads `product_id, rating` for
 * the whole batch once and folds it here.
 *
 * A PRODUCT WITH NO APPROVED REVIEW IS ABSENT FROM THE MAP, not present with a
 * zero. `RatingStars` renders nothing for a missing summary, which is what
 * keeps an unrated product from displaying a fabricated score of zero.
 *
 * Cached and tagged like every other catalogue read, so an approval invalidates
 * the card grids at the same moment it invalidates the product page --
 * `admin/reviews.ts` calls `updateTag(CATALOGUE_TAG)` on the decision.
 */
export async function getRatingSummaries(
  productIds: readonly string[],
): Promise<Map<string, RatingSummary>> {
  'use cache'
  cacheLife('hours')
  cacheTag(CATALOGUE_TAG)
  const out = new Map<string, RatingSummary>()
  if (productIds.length === 0) return out

  const supabase = createPublicClient()
  const { data, error } = await supabase
    .from('reviews' as never)
    .select('product_id, rating')
    .in('product_id', productIds as string[])
    .eq('status', 'approved')

  if (error) {
    if (error.code !== TABLE_MISSING) {
      log.warn('reviews.summaries_failed', { code: error.code ?? null })
    }
    return out
  }

  const byProduct = new Map<string, number[]>()
  for (const row of (data ?? []) as unknown as { product_id: string; rating: number }[]) {
    const list = byProduct.get(row.product_id)
    if (list) list.push(row.rating)
    else byProduct.set(row.product_id, [row.rating])
  }
  for (const [productId, ratings] of byProduct) {
    const summary = summarizeRatings(ratings)
    if (summary) out.set(productId, summary)
  }
  return out
}

/**
 * Attaches a `rating` to anything carrying an `id`. One call at the point a
 * card list is built, rather than a prop threaded through every grid.
 *
 * Products whose id is not a uuid (the captured live-deals fixture uses
 * synthetic ids) simply come back with `rating: null`, which is the same
 * outcome as an unrated product and needs no special case at the call site.
 */
/**
 * Every approved rating across one supplier's products, folded into one figure.
 *
 * THE HONEST AGGREGATE FOR A BUSINESS. A shopper judging a spa does not care
 * which of its three treatments a review was left on; the question they are
 * asking is about the spa. `getRatingSummaries` answers the per-product
 * question and this answers the per-business one, and they are different
 * numbers on purpose.
 *
 * NOT capped and not paged: an average that stopped at a page boundary would be
 * an average of whichever reviews happened to sort first, which is a number
 * that looks precise and means nothing. Same reason `getProductReviews` reads
 * the ratings separately from the list it displays.
 *
 * Returns null with no approved reviews, so the caller omits the
 * `AggregateRating` entirely rather than publishing a zero.
 */
export async function getSupplierRating(supplierId: string): Promise<RatingSummary | null> {
  'use cache'
  cacheLife('hours')
  cacheTag(CATALOGUE_TAG)

  const supabase = createPublicClient()
  const { data, error } = await supabase
    .from('reviews' as never)
    .select('rating, products!inner(supplier_id)')
    .eq('status', 'approved')
    .eq('products.supplier_id', supplierId)

  if (error) {
    // The table is missing on a pre-154 deployment. Silent, and null: a
    // supplier page must not fail over structured data.
    if (error.code !== TABLE_MISSING) {
      log.warn('reviews.supplier_rating_failed', { supplierId, code: error.code ?? null })
    }
    return null
  }

  const ratings = ((data ?? []) as unknown as { rating: number }[]).map((row) => row.rating)
  return summarizeRatings(ratings)
}

export async function attachRatings<T extends { id: string }>(
  products: readonly T[],
): Promise<(T & { rating: RatingSummary | null })[]> {
  const summaries = await getRatingSummaries(products.map((p) => p.id))
  return products.map((product) => ({ ...product, rating: summaries.get(product.id) ?? null }))
}
