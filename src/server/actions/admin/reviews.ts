'use server'

import { writeAuditLog } from '@/lib/admin/audit'
import { requireStaffSession } from '@/lib/admin/rbac'
import { CATALOGUE_TAG } from '@/lib/catalogue-cache'
import { withActionContext } from '@/lib/observability/action-context'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath, updateTag } from 'next/cache'
import { z } from 'zod'

/**
 * Admin moderation of a pending review. Service role, because 154 grants
 * users no UPDATE on `reviews` at all: a buyer cannot edit after submit.
 *
 * updateTag(CATALOGUE_TAG) is required: approval is what makes a review
 * visible, and pending 221 will cache the average on the product row.
 */

const idSchema = z.string().uuid()

export type ModerateReviewState = { error?: string } | { success: string }

async function setStatus(
  id: string,
  status: 'approved' | 'rejected',
): Promise<ModerateReviewState> {
  let session: Awaited<ReturnType<typeof requireStaffSession>>
  try {
    session = await requireStaffSession()
  } catch {
    return { error: 'אין הרשאה' }
  }
  if (!idSchema.safeParse(id).success) return { error: 'מזהה לא תקין' }

  const admin = createAdminClient()
  const { data: row } = await admin
    .from('reviews')
    .select('id, status, product_id')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()
  if (!row) return { error: 'ביקורת לא נמצאה' }
  if (row.status !== 'pending') return { error: 'אפשר להחליט רק על ביקורת ממתינה' }

  const now = new Date().toISOString()
  const { error } = await admin
    .from('reviews')
    .update({
      status,
      reviewed_at: now,
      reviewed_by: session.userId,
    })
    .eq('id', id)
    .eq('status', 'pending')
  if (error) return { error: error.message }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'status_change',
    entityType: 'reviews',
    entityId: id,
    changes: { status: { from: row.status, to: status } },
    metadata: { product_id: row.product_id },
  })

  revalidatePath('/admin/reviews')
  updateTag(CATALOGUE_TAG)
  return { success: status === 'approved' ? 'הביקורת אושרה' : 'הביקורת נדחתה' }
}

export async function approveReview(id: string): Promise<ModerateReviewState> {
  return withActionContext('admin.reviews.approve', () => setStatus(id, 'approved'))
}

export async function rejectReview(id: string): Promise<ModerateReviewState> {
  return withActionContext('admin.reviews.reject', () => setStatus(id, 'rejected'))
}
