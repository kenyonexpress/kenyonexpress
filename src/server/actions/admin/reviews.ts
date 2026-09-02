'use server'

import { writeAuditLog } from '@/lib/admin/audit'
import { requireSection } from '@/lib/admin/rbac'
import { CATALOGUE_TAG } from '@/lib/catalogue-cache'
import { withActionContext } from '@/lib/observability/action-context'
import { TABLE_MISSING } from '@/lib/reviews/reviews'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath, updateTag } from 'next/cache'

/**
 * Review moderation. The one write path that moves a review out of `pending`,
 * and it runs on the service role because users deliberately have NO UPDATE
 * policy on reviews (154): a buyer cannot edit a review after approval, and
 * nobody edits someone else's. Moderation is catalog content, so the gate is
 * the catalog section; every decision lands in the audit log by name.
 */

export type ModerateReviewState = { ok: boolean; error?: string }

async function runModerateReview(
  reviewId: string,
  decision: 'approved' | 'rejected',
): Promise<ModerateReviewState> {
  const session = await requireSection('catalog', 'write')
  if (!/^[0-9a-f-]{36}$/i.test(reviewId) || (decision !== 'approved' && decision !== 'rejected')) {
    return { ok: false, error: 'קלט לא תקין.' }
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('reviews' as never)
    .update({
      status: decision,
      reviewed_at: new Date().toISOString(),
      reviewed_by: session.userId,
    } as never)
    .eq('id', reviewId)
    .eq('status', 'pending')
    .select('id, product_id')
    .maybeSingle()

  if (error) {
    if (error.code === TABLE_MISSING) {
      return { ok: false, error: 'טבלת הביקורות עוד לא הוחלה (מיגרציה 154).' }
    }
    return { ok: false, error: 'העדכון נכשל.' }
  }
  // Already moderated (or gone): refresh will show the truth; not an error to
  // shout about when two admins race on the same row.
  if (!data) return { ok: true }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'status_change',
    entityType: 'review',
    entityId: reviewId,
    changes: { status: { from: 'pending', to: decision } },
  })

  // An approved review changes the cached product page (list + JSON-LD).
  updateTag(CATALOGUE_TAG)
  revalidatePath('/admin/reviews')
  return { ok: true }
}

export async function moderateReview(
  reviewId: string,
  decision: 'approved' | 'rejected',
): Promise<ModerateReviewState> {
  return withActionContext('admin.reviews.moderate', () => runModerateReview(reviewId, decision))
}
