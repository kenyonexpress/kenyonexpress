'use server'

import { withActionContext } from '@/lib/observability/action-context'
import { rateLimit } from '@/lib/rate-limit/limiter'
import {
  type ExistingReview,
  REVIEW_BODY_MAX,
  REVIEW_REFUSAL_HE,
  refuseReview,
} from '@/lib/reviews/eligibility'
import { createAdminClient } from '@/lib/supabase/admin'
import { TABLE_MISSING } from '@/lib/supabase/error-codes'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

/**
 * Customer review insert, on the USER client, never the admin one.
 *
 * RLS (154) is the verification: the row is insertable only when the named
 * line belongs to a paid-or-later order of the inserting user. Running this
 * through the service role would bypass that and let any session write a
 * review about a purchase they did not make.
 *
 * NO updateTag HERE. A fresh row is `pending`. The cached catalogue read
 * (when 221 lands) filters approved reviews, so flushing the catalogue on
 * every submission would publish nothing. Approval is
 * `server/actions/admin/reviews.ts`, and that path DOES call updateTag.
 */

const UNIQUE_VIOLATION = '23505'
const TABLE_NOT_APPLIED = 'מערכת הביקורות עוד לא פתוחה.'
const GENERIC_FAILURE = 'השליחה נכשלה. נסו שוב.'

export type SubmitReviewState = { ok: true } | { ok: false; error: string }

async function runSubmitReview(input: {
  orderItemId: string
  productId: string
  rating: number
  body: string | null
}): Promise<SubmitReviewState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: REVIEW_REFUSAL_HE.not_signed_in }

  const decision = await rateLimit('review-submit', user.id)
  if (!decision.allowed) return { ok: false, error: 'יותר מדי ניסיונות. נסו שוב מאוחר יותר.' }

  const admin = createAdminClient()
  const { data: line } = await admin
    .from('order_items')
    .select('id, product_id, order_id')
    .eq('id', input.orderItemId)
    .maybeSingle()
  if (!line) return { ok: false, error: REVIEW_REFUSAL_HE.wrong_product }

  const { data: order } = await admin
    .from('orders')
    .select('user_id, status')
    .eq('id', line.order_id)
    .maybeSingle()
  if (!order) return { ok: false, error: REVIEW_REFUSAL_HE.wrong_product }

  const { data: existingRows } = await supabase
    .from('reviews')
    .select('order_item_id, product_id, deleted_at')
    .eq('user_id', user.id)

  const existing: ExistingReview[] = (existingRows ?? []).map((row) => ({
    orderItemId: row.order_item_id,
    productId: row.product_id,
    deletedAt: row.deleted_at,
  }))

  const body =
    input.body == null
      ? null
      : input.body.trim() === ''
        ? null
        : input.body.trim().slice(0, REVIEW_BODY_MAX)

  const refusal = refuseReview({
    userId: user.id,
    orderUserId: order.user_id,
    orderStatus: order.status,
    productId: input.productId,
    lineProductId: line.product_id,
    orderItemId: input.orderItemId,
    rating: input.rating,
    body,
    existing,
  })
  if (refusal) return { ok: false, error: REVIEW_REFUSAL_HE[refusal] }

  const { error } = await supabase.from('reviews').insert({
    user_id: user.id,
    product_id: input.productId,
    order_item_id: input.orderItemId,
    rating: input.rating,
    body,
    status: 'pending',
  })

  if (error) {
    if (error.code === TABLE_MISSING) return { ok: false, error: TABLE_NOT_APPLIED }
    if (error.code === UNIQUE_VIOLATION)
      return { ok: false, error: REVIEW_REFUSAL_HE.duplicate_line }
    return { ok: false, error: GENERIC_FAILURE }
  }

  revalidatePath('/account/orders')
  return { ok: true }
}

export async function submitReview(input: {
  orderItemId: string
  productId: string
  rating: number
  body: string | null
}): Promise<SubmitReviewState> {
  return withActionContext('reviews.submit', () => runSubmitReview(input))
}
