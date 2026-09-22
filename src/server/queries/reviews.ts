import { log } from '@/lib/observability/log'
import type { ExistingReview } from '@/lib/reviews/eligibility'
import { createPublicClient } from '@/lib/supabase/anon'
import { TABLE_MISSING } from '@/lib/supabase/error-codes'
import { createClient } from '@/lib/supabase/server'

export interface PublicReview {
  id: string
  rating: number
  body: string | null
  createdAt: string
}

export async function listApprovedReviews(productId: string): Promise<PublicReview[]> {
  const { data, error } = await createPublicClient()
    .from('reviews')
    .select('id, rating, body, created_at')
    .eq('product_id', productId)
    .eq('status', 'approved')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    if (error.code !== TABLE_MISSING) {
      log.warn('reviews.public_read_failed', { code: error.code ?? null })
    }
    return []
  }
  return (data ?? []).map((row) => ({
    id: row.id,
    rating: row.rating,
    body: row.body,
    createdAt: row.created_at,
  }))
}

export async function getMyReviewsForItems(
  orderItemIds: readonly string[],
): Promise<ExistingReview[]> {
  if (orderItemIds.length === 0) return []
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('reviews')
    .select('order_item_id, product_id, deleted_at')
    .eq('user_id', user.id)
    .in('order_item_id', [...orderItemIds])

  if (error) {
    if (error.code !== TABLE_MISSING) {
      log.warn('reviews.owner_read_failed', { code: error.code ?? null })
    }
    return []
  }
  return (data ?? []).map((row) => ({
    orderItemId: row.order_item_id,
    productId: row.product_id,
    deletedAt: row.deleted_at,
  }))
}
