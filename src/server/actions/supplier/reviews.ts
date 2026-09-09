'use server'

import { writeAuditLog } from '@/lib/admin/audit'
import { CATALOGUE_TAG } from '@/lib/catalogue-cache'
import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import { createClient } from '@/lib/supabase/server'
import { requireSupplierRole } from '@/lib/supplier/rbac'
import { revalidatePath, updateTag } from 'next/cache'

/**
 * A supplier answering a review of their own product.
 *
 * WRITTEN THROUGH THE REQUEST-SCOPED CLIENT, NOT THE SERVICE ROLE, and here
 * that is not a preference — it is the whole security model.
 *
 * 199's policy proves the membership in SQL, through `products.supplier_id`
 * joined to `supplier_members`, and its column grant restricts the UPDATE to
 * the three reply columns. Both halves are enforced by the database only when
 * the caller IS the customer's role. Reaching for the admin client would bypass
 * both and leave "may this supplier edit this review, and which columns" as a
 * TypeScript condition somebody has to get right every time.
 *
 * THE REVOKE IN 199 IS WHY THIS IS SAFE AT ALL. `authenticated` held a
 * table-wide UPDATE grant on `reviews` that was inert only because no UPDATE
 * policy existed. Adding the policy would have made it live — a supplier
 * rewriting the rating and body of a review about their own business — and a
 * probe against production caught exactly that before it shipped.
 */

export type SupplierReplyState = { ok: boolean; error?: string }

const MISSING_COLUMN = new Set(['42703', 'PGRST204'])

async function runReply(reviewId: string, reply: string): Promise<SupplierReplyState> {
  const session = await requireSupplierRole('manager')
  if (!/^[0-9a-f-]{36}$/i.test(reviewId)) return { ok: false, error: 'ביקורת לא תקינה.' }

  const text = reply.trim()
  // Matches the CHECK in 199 rather than restating a different bound. A form
  // that accepts what the database refuses produces a 23514 the customer reads
  // as "the site is broken".
  if (text.length < 2 || text.length > 1000) {
    return { ok: false, error: 'התגובה צריכה להיות בין 2 ל-1000 תווים.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('reviews' as never)
    .update({
      supplier_reply: text,
      supplier_replied_at: new Date().toISOString(),
      supplier_replied_by: session.userId,
    } as never)
    .eq('id', reviewId)
    .select('id')
    .maybeSingle()

  if (error) {
    if (MISSING_COLUMN.has(error.code ?? '')) {
      log.warn('supplier.review_reply_unavailable', {
        detail: '199 is written and not applied; the reply columns do not exist.',
      })
      return { ok: false, error: 'התגובות עדיין לא זמינות.' }
    }
    log.warn('supplier.review_reply_failed', { reason: error.message })
    return { ok: false, error: 'השמירה נכשלה.' }
  }

  // Zero rows means the RLS policy refused: this review is not about a product
  // this supplier supplies. Answered as "not found" rather than "forbidden",
  // the same reason the shipping action gives — "forbidden" confirms the id
  // exists and lets a supplier enumerate other suppliers' reviews.
  if (!data) return { ok: false, error: 'הביקורת לא נמצאה.' }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: 'vendor',
    action: 'updated',
    entityType: 'review',
    entityId: reviewId,
    changes: { supplier_reply: text.slice(0, 200) },
    metadata: {
      via: 'supplier_portal',
      supplier_id: session.supplierId,
      member_role: session.memberRole,
    },
  })

  // The product page's review list is cached under CATALOGUE_TAG, so without
  // this a reply would take up to an hour to appear beneath the review it
  // answers -- and the supplier, seeing their own portal update immediately,
  // would have no way to tell. `updateTag` and not `revalidateTag` for the
  // reason catalogue-cache.ts gives: it expires the entry now.
  updateTag(CATALOGUE_TAG)
  revalidatePath('/supplier/reviews')
  return { ok: true }
}

export async function replyToReview(reviewId: string, reply: string): Promise<SupplierReplyState> {
  return withActionContext('supplier.reviews.reply', () => runReply(reviewId, reply))
}
