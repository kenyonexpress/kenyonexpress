import { log } from '@/lib/observability/log'
import { FEEDBACK_TABLE_MISSING } from '@/lib/orders/feedback'
import { TABLE_MISSING } from '@/lib/reviews/reviews'
import type { createAdminClient } from '@/lib/supabase/admin'

/**
 * The owner's view of every rating the shop has collected (STEP 45).
 *
 * TWO SOURCES, ONE AUDIENCE. A buyer can score the ORDER (`order_feedback`,
 * pending 247: delivery, packaging, the counter) and can score a PRODUCT they
 * bought (`reviews`, 154/232: one per purchased line). Both are collected
 * after the sale, both are private, and until this module neither had a
 * place where the owner could read them together: the order score sat on
 * one admin order page at a time and the product score sat in a moderation
 * queue that only listed `pending`.
 *
 * SERVICE ROLE ON PURPOSE. Both tables are owner-scoped for `authenticated`
 * (247's SELECT policy, 154's `reviews_owner_read`), so an admin's own
 * session sees only the admin's own rows. The admin client is the only
 * client that can read across customers, and the two callers of this module
 * (/admin/reviews and /admin/dashboard) sit behind `requireSection` before
 * they ask. Nothing here is reachable from the storefront;
 * src/__tests__/ratings-never-public.test.ts pins that.
 *
 * NO PUBLIC NUMBER. The averages computed here are for the owner's eyes. The
 * product page carries no star row and no JSON-LD AggregateRating (the
 * second half of pending 235 was removed before apply), so there is no
 * second consumer to keep in step with.
 *
 * BOTH DEGRADE WHILE UNAPPLIED. `order_feedback` is PGRST205 until 247 is
 * applied; `reviews` exists in production (0 rows measured 2026-10-08) but
 * the same guard stays for a from-zero database. A missing table is
 * `available: false` and no log line, because it is the documented state.
 */

export type RatingValue = 1 | 2 | 3 | 4 | 5

/** A score at or below this is "low" and surfaces first for the owner. */
export const LOW_RATING_MAX = 2

export interface RatingSummary {
  count: number
  /** One decimal, null when there is nothing to average. */
  average: number | null
  distribution: Record<RatingValue, number>
  /** Count of scores at or below LOW_RATING_MAX. */
  low: number
}

export interface OrderFeedbackEntry {
  id: string
  orderId: string
  rating: number
  body: string | null
  createdAt: string
  orderCreatedAt: string | null
  orderStatus: string | null
  customerName: string | null
  customerEmail: string | null
}

export interface ProductReviewEntry {
  id: string
  productId: string
  productName: string | null
  productSlug: string | null
  rating: number
  body: string | null
  status: string
  createdAt: string
  customerName: string | null
  customerEmail: string | null
}

export interface RatingsOverview {
  /** ISO timestamp the window starts at, or null for all time. */
  since: string | null
  feedback: {
    available: boolean
    summary: RatingSummary
    entries: OrderFeedbackEntry[]
  }
  reviews: {
    available: boolean
    summary: RatingSummary
    pending: number
    entries: ProductReviewEntry[]
  }
}

export interface RatingsTile {
  available: boolean
  count: number
  average: number | null
  low: number
  pendingReviews: number
}

export type RatingFilter = 'all' | 'low' | RatingValue

export interface RatingsQuery {
  /** Window in days; 0 or undefined means all time. */
  days?: number
  filter?: RatingFilter
  /** Per source. The page is a reading surface, not an export. */
  limit?: number
}

type AdminClient = ReturnType<typeof createAdminClient>

const EMPTY_DISTRIBUTION = (): Record<RatingValue, number> => ({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 })

function isRatingValue(value: unknown): value is RatingValue {
  return value === 1 || value === 2 || value === 3 || value === 4 || value === 5
}

/**
 * Count, one-decimal average, per-score distribution and the low count over
 * a list of scores. Pure, so the page and the dashboard tile agree by
 * construction. Scores outside 1..5 (which the CHECK constraints forbid, but
 * a cast row could carry) are dropped rather than averaged.
 */
export function summarizeRatings(ratings: readonly number[]): RatingSummary {
  const distribution = EMPTY_DISTRIBUTION()
  let sum = 0
  let count = 0
  let low = 0
  for (const raw of ratings) {
    const value = Number(raw)
    if (!isRatingValue(value)) continue
    distribution[value] += 1
    sum += value
    count += 1
    if (value <= LOW_RATING_MAX) low += 1
  }
  return {
    count,
    average: count > 0 ? Math.round((sum / count) * 10) / 10 : null,
    distribution,
    low,
  }
}

/** The window start for a `days` value, computed once per call so both reads agree. */
export function windowStart(days: number | undefined, now: Date = new Date()): string | null {
  if (!days || !Number.isFinite(days) || days <= 0) return null
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString()
}

/** Reads `?rating=` the way the page spells it; anything else is "all". */
export function parseRatingFilter(raw: string | string[] | undefined): RatingFilter {
  const value = Array.isArray(raw) ? raw[0] : raw
  if (value === 'low') return 'low'
  const n = Number(value)
  return isRatingValue(n) ? n : 'all'
}

/** Reads `?days=`; the four windows the page offers, default 30. */
export function parseDays(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw
  if (value === 'all') return 0
  const n = Number(value)
  return n === 7 || n === 30 || n === 90 ? n : 30
}

function applyFilter<T extends { rating: number }>(rows: T[], filter: RatingFilter): T[] {
  if (filter === 'all') return rows
  if (filter === 'low') return rows.filter((row) => row.rating <= LOW_RATING_MAX)
  return rows.filter((row) => row.rating === filter)
}

interface FeedbackRow {
  id: string
  order_id: string
  rating: number
  body: string | null
  created_at: string
  order: { id: string; created_at: string; status: string } | null
  profile: { full_name: string | null; email: string | null } | null
}

interface ReviewRow {
  id: string
  product_id: string
  rating: number
  body: string | null
  status: string
  created_at: string
  product: { name_he: string | null; slug: string | null } | null
  profile: { full_name: string | null; email: string | null } | null
}

function tableMissing(error: { code?: string } | null): boolean {
  return error?.code === FEEDBACK_TABLE_MISSING || error?.code === TABLE_MISSING
}

/**
 * Everything /admin/reviews renders, in one call. The window and the filter
 * are applied in SQL where the index helps (`created_at`) and in memory where
 * it does not (a `rating` filter over at most `limit` rows), so the summary
 * cards describe the WINDOW while the list describes the filter: "4.6 over
 * 31 scores, of which these 3 are low" is the sentence the owner is reading.
 */
export async function readRatingsOverview(
  admin: AdminClient,
  query: RatingsQuery = {},
): Promise<RatingsOverview> {
  const since = windowStart(query.days)
  const filter = query.filter ?? 'all'
  const limit = Math.min(500, Math.max(1, query.limit ?? 200))

  let feedbackQuery = admin
    .from('order_feedback' as never)
    .select(
      'id, order_id, rating, body, created_at, order:orders(id, created_at, status), profile:profiles(full_name, email)',
    )
    .order('created_at', { ascending: false })
    .limit(limit)
  if (since) feedbackQuery = feedbackQuery.gte('created_at', since)

  let reviewsQuery = admin
    .from('reviews' as never)
    .select(
      'id, product_id, rating, body, status, created_at, product:products(name_he, slug), profile:profiles(full_name, email)',
    )
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (since) reviewsQuery = reviewsQuery.gte('created_at', since)

  const [feedbackResult, reviewsResult] = await Promise.all([feedbackQuery, reviewsQuery])

  const feedbackRows = (feedbackResult.data ?? []) as unknown as FeedbackRow[]
  const reviewRows = (reviewsResult.data ?? []) as unknown as ReviewRow[]

  if (feedbackResult.error && !tableMissing(feedbackResult.error)) {
    log.warn('ratings_admin.feedback_read_failed', { code: feedbackResult.error.code ?? null })
  }
  if (reviewsResult.error && !tableMissing(reviewsResult.error)) {
    log.warn('ratings_admin.reviews_read_failed', { code: reviewsResult.error.code ?? null })
  }

  const feedbackEntries: OrderFeedbackEntry[] = feedbackRows.map((row) => ({
    id: row.id,
    orderId: row.order_id,
    rating: Number(row.rating),
    body: row.body,
    createdAt: row.created_at,
    orderCreatedAt: row.order?.created_at ?? null,
    orderStatus: row.order?.status ?? null,
    customerName: row.profile?.full_name ?? null,
    customerEmail: row.profile?.email ?? null,
  }))

  const reviewEntries: ProductReviewEntry[] = reviewRows.map((row) => ({
    id: row.id,
    productId: row.product_id,
    productName: row.product?.name_he ?? null,
    productSlug: row.product?.slug ?? null,
    rating: Number(row.rating),
    body: row.body,
    status: row.status,
    createdAt: row.created_at,
    customerName: row.profile?.full_name ?? null,
    customerEmail: row.profile?.email ?? null,
  }))

  return {
    since,
    feedback: {
      available: feedbackResult.error == null,
      summary: summarizeRatings(feedbackEntries.map((entry) => entry.rating)),
      entries: applyFilter(feedbackEntries, filter),
    },
    reviews: {
      available: reviewsResult.error == null,
      summary: summarizeRatings(reviewEntries.map((entry) => entry.rating)),
      pending: reviewEntries.filter((entry) => entry.status === 'pending').length,
      entries: applyFilter(reviewEntries, filter),
    },
  }
}

/**
 * The dashboard's one card: order scores in the window, plus how many
 * product reviews await a look. Reads the `rating` column only; the text
 * stays on /admin/reviews where there is room to read it.
 */
export async function readRatingsTile(admin: AdminClient, days = 30): Promise<RatingsTile> {
  const since = windowStart(days)

  let feedbackQuery = admin
    .from('order_feedback' as never)
    .select('rating')
    .limit(1000)
  if (since) feedbackQuery = feedbackQuery.gte('created_at', since)

  const [feedbackResult, pendingResult] = await Promise.all([
    feedbackQuery,
    admin
      .from('reviews' as never)
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .is('deleted_at', null),
  ])

  if (feedbackResult.error) {
    if (!tableMissing(feedbackResult.error)) {
      log.warn('ratings_admin.tile_read_failed', { code: feedbackResult.error.code ?? null })
    }
    return { available: false, count: 0, average: null, low: 0, pendingReviews: 0 }
  }

  const summary = summarizeRatings(
    ((feedbackResult.data ?? []) as unknown as { rating: number }[]).map((row) => row.rating),
  )
  return {
    available: true,
    count: summary.count,
    average: summary.average,
    low: summary.low,
    pendingReviews: pendingResult.error ? 0 : (pendingResult.count ?? 0),
  }
}
