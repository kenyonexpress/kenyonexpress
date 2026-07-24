'use server'

import { writeAuditLog } from '@/lib/admin/audit'
import { type AdminSessionInfo, requireAdminSession } from '@/lib/admin/rbac'
import { createClient } from '@/lib/supabase/server'
import type { AffiliateStatus } from '@/types/database'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

export type AffiliateActionState = { error: string } | { success: string } | null

const decisionSchema = z.object({
  id: z.string().uuid({ message: 'מזהה לא תקין' }),
  decision: z.enum(['approved', 'rejected', 'suspended']),
})

const DECISION_SUCCESS: Record<'approved' | 'rejected' | 'suspended', string> = {
  approved: 'השותף אושר',
  rejected: 'הבקשה נדחתה',
  suspended: 'השותף הושעה',
}

export async function decideAffiliate(
  _: AffiliateActionState,
  formData: FormData,
): Promise<AffiliateActionState> {
  let session: AdminSessionInfo
  try {
    session = await requireAdminSession()
  } catch {
    return { error: 'אין הרשאה' }
  }

  const parsed = decisionSchema.safeParse({
    id: formData.get('id'),
    decision: formData.get('decision'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'קלט לא תקין' }

  const supabase = await createClient()
  const { data: affiliate } = await supabase
    .from('affiliates')
    .select('id, status, affiliate_code')
    .eq('id', parsed.data.id)
    .single()
  if (!affiliate) return { error: 'שותף לא נמצא' }

  const newStatus = parsed.data.decision as AffiliateStatus
  const update: {
    status: AffiliateStatus
    approved_at?: string
    approved_by?: string
  } = { status: newStatus }
  if (newStatus === 'approved') {
    update.approved_at = new Date().toISOString()
    update.approved_by = session.userId
  }

  const { error } = await supabase.from('affiliates').update(update).eq('id', parsed.data.id)
  if (error) return { error: error.message }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'status_change',
    entityType: 'affiliates',
    entityId: parsed.data.id,
    changes: { status: { from: affiliate.status, to: newStatus } },
    metadata: { affiliate_code: affiliate.affiliate_code },
  })

  revalidatePath('/admin/affiliates')
  return { success: DECISION_SUCCESS[parsed.data.decision] }
}
