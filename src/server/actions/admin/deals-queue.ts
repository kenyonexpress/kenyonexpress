'use server'

import { writeAuditLog } from '@/lib/admin/audit'
import { type AdminSessionInfo, requireAdminSession } from '@/lib/admin/rbac'
import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

/**
 * Admin review of a `deal_candidates` row: approve or reject, never publish.
 *
 * The ADMIN client, not the session's own -- same reason as
 * src/server/actions/admin/supplier-image-submissions.ts: migration 237
 * gives `deal_candidates` only supplier-scoped RLS policies (a supplier
 * reads and inserts their own rows), no admin policy at all, because the
 * review action here is meant to be the only path that can move a
 * candidate off 'pending_review' in the first place.
 *
 * NOT A PUBLISH ACTION. 'approved' records that an admin has vetted this
 * candidate; it does not create a public.products row. See
 * docs/DEALS-PIPELINE.md for the full reasoning -- in short,
 * platform_percent has no default anywhere in this codebase and a feed
 * cannot supply one, so turning an approved candidate into a real product
 * remains a separate, later action.
 */

const TABLE_ABSENT = new Set(['PGRST205', 'PGRST106', '42P01'])
const rejectSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().trim().min(2, 'נדרשת סיבת דחייה').max(500),
})

async function loadPending(
  id: string,
): Promise<{ row?: { id: string; status: string }; error?: string }> {
  if (!z.string().uuid().safeParse(id).success) return { error: 'מזהה לא תקין' }
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('deal_candidates' as never)
    .select('id, status')
    .eq('id', id)
    .maybeSingle()
  if (error) {
    if (TABLE_ABSENT.has(error.code ?? '')) return { error: 'תור הדילים עדיין לא זמין.' }
    log.warn('admin.deal_candidate_read_failed', { reason: error.message })
    return { error: 'קריאת הדיל נכשלה.' }
  }
  const row = data as { id: string; status: string } | null
  if (!row) return { error: 'הדיל לא נמצא.' }
  if (row.status !== 'pending_review') return { error: 'הדיל כבר טופל.' }
  return { row }
}

async function runApproveDealCandidate(id: string): Promise<{ error?: string }> {
  let session: AdminSessionInfo
  try {
    session = await requireAdminSession()
  } catch {
    return { error: 'אין הרשאה' }
  }

  const { row, error: loadError } = await loadPending(id)
  if (!row) return { error: loadError }

  const admin = createAdminClient()
  const { error } = await admin
    .from('deal_candidates' as never)
    .update({
      status: 'approved',
      reviewed_by: session.userId,
      reviewed_at: new Date().toISOString(),
      rejection_reason: null,
    } as never)
    .eq('id', id)
  if (error) return { error: error.message }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'status_change',
    entityType: 'deal_candidates',
    entityId: id,
    changes: { status: { from: 'pending_review', to: 'approved' } },
  })

  revalidatePath('/admin/deals-queue')
  return {}
}

async function runRejectDealCandidate(id: string, reason: string): Promise<{ error?: string }> {
  let session: AdminSessionInfo
  try {
    session = await requireAdminSession()
  } catch {
    return { error: 'אין הרשאה' }
  }

  const parsed = rejectSchema.safeParse({ id, reason })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'נתונים לא תקינים' }

  const { row, error: loadError } = await loadPending(parsed.data.id)
  if (!row) return { error: loadError }

  const admin = createAdminClient()
  const { error } = await admin
    .from('deal_candidates' as never)
    .update({
      status: 'rejected',
      reviewed_by: session.userId,
      reviewed_at: new Date().toISOString(),
      rejection_reason: parsed.data.reason,
    } as never)
    .eq('id', parsed.data.id)
  if (error) return { error: error.message }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'status_change',
    entityType: 'deal_candidates',
    entityId: parsed.data.id,
    changes: { status: { from: 'pending_review', to: 'rejected' }, reason: parsed.data.reason },
  })

  revalidatePath('/admin/deals-queue')
  return {}
}

export async function approveDealCandidate(id: string): Promise<{ error?: string }> {
  return withActionContext('admin.deal_candidate.approve', () => runApproveDealCandidate(id))
}

export async function rejectDealCandidate(id: string, reason: string): Promise<{ error?: string }> {
  return withActionContext('admin.deal_candidate.reject', () => runRejectDealCandidate(id, reason))
}
