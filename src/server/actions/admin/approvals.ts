'use server'

import { writeAuditLog } from '@/lib/admin/audit'
import { type AdminSessionInfo, requireAdminSession } from '@/lib/admin/rbac'
import { CATALOGUE_TAG } from '@/lib/catalogue-cache'
import { withActionContext } from '@/lib/observability/action-context'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath, updateTag } from 'next/cache'
import { z } from 'zod'

// Admin decisions on content-uploader submissions. Both actions write an
// explicit status_change entry to the consolidated audit log.

const rejectSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().min(2, 'נדרשת סיבת דחייה').max(500),
})

export type ApprovalActionState = { error: string } | { success: string } | null

async function runApproveProduct(id: string): Promise<{ error?: string }> {
  let session: AdminSessionInfo
  try {
    session = await requireAdminSession()
  } catch {
    return { error: 'אין הרשאה' }
  }

  if (!z.string().uuid().safeParse(id).success) return { error: 'מזהה לא תקין' }

  const supabase = await createClient()
  const { data: product } = await supabase
    .from('products')
    .select('id, name_he, approval_status')
    .eq('id', id)
    .single()
  if (!product) return { error: 'מוצר לא נמצא' }

  const { error } = await supabase
    .from('products')
    .update({
      approval_status: 'approved',
      approval_note: null,
      approved_by: session.userId,
      approved_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) return { error: error.message }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'status_change',
    entityType: 'products',
    entityId: id,
    changes: { approval_status: { from: product.approval_status, to: 'approved' } },
    metadata: { name_he: product.name_he, flow: 'product_approval' },
  })

  revalidatePath('/admin/approvals')
  revalidatePath('/admin/products')
  updateTag(CATALOGUE_TAG)
  return {}
}

async function runRejectProduct(id: string, reason: string): Promise<{ error?: string }> {
  let session: AdminSessionInfo
  try {
    session = await requireAdminSession()
  } catch {
    return { error: 'אין הרשאה' }
  }

  const parsed = rejectSchema.safeParse({ id, reason })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'נתונים לא תקינים' }

  const supabase = await createClient()
  const { data: product } = await supabase
    .from('products')
    .select('id, name_he, approval_status, status')
    .eq('id', id)
    .single()
  if (!product) return { error: 'מוצר לא נמצא' }

  const { error } = await supabase
    .from('products')
    .update({
      approval_status: 'rejected',
      approval_note: parsed.data.reason,
      approved_by: null,
      approved_at: null,
      // A rejected product can never stay live.
      status: product.status === 'active' ? 'draft' : product.status,
    })
    .eq('id', id)
  if (error) return { error: error.message }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'status_change',
    entityType: 'products',
    entityId: id,
    changes: { approval_status: { from: product.approval_status, to: 'rejected' } },
    metadata: { name_he: product.name_he, reason: parsed.data.reason, flow: 'product_approval' },
  })

  revalidatePath('/admin/approvals')
  revalidatePath('/admin/products')
  updateTag(CATALOGUE_TAG)
  return {}
}

export async function approveProduct(id: string): Promise<{ error?: string }> {
  return withActionContext('admin.product.approve', () => runApproveProduct(id))
}

export async function rejectProduct(id: string, reason: string): Promise<{ error?: string }> {
  return withActionContext('admin.product.reject', () => runRejectProduct(id, reason))
}
