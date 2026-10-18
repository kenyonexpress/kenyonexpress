'use server'

import { writeAuditLog } from '@/lib/admin/audit'
import { type AdminSessionInfo, requireAdminSession, requireSection } from '@/lib/admin/rbac'
import { withActionContext } from '@/lib/observability/action-context'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { AffiliateStatus } from '@/types/database'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
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

async function runDecideAffiliate(
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

export async function decideAffiliate(
  _: AffiliateActionState,
  formData: FormData,
): Promise<AffiliateActionState> {
  return withActionContext('admin.affiliate.decide', () => runDecideAffiliate(_, formData))
}

// ---- campaigns (rc5 F12, migration 283) -----------------------------------

const campaignSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(80),
  // Percent as typed, two decimals at most, stored as integer basis points.
  commission_percent: z
    .string()
    .trim()
    .regex(/^\d{1,2}(\.\d{1,2})?$/),
  active: z.enum(['on']).optional(),
  starts_at: z.string().trim().optional(),
  ends_at: z.string().trim().optional(),
})

function percentToBp(value: string): number {
  const [whole = '0', frac = ''] = value.split('.')
  return Number(whole) * 100 + Number(frac.padEnd(2, '0').slice(0, 2))
}

async function runSaveCampaign(formData: FormData): Promise<void> {
  let session: AdminSessionInfo
  try {
    session = await requireSection('affiliates', 'write')
  } catch {
    redirect('/admin/affiliates/campaigns?error=forbidden')
  }
  const parsed = campaignSchema.safeParse({
    id: formData.get('id') || undefined,
    name: formData.get('name') ?? '',
    commission_percent: formData.get('commission_percent') ?? '',
    active: formData.get('active') ?? undefined,
    starts_at: formData.get('starts_at') || undefined,
    ends_at: formData.get('ends_at') || undefined,
  })
  if (!parsed.success) redirect('/admin/affiliates/campaigns?error=invalid')
  const d = parsed.data
  const commission_bp = percentToBp(d.commission_percent)
  if (commission_bp > 5000) redirect('/admin/affiliates/campaigns?error=invalid')

  const row = {
    name: d.name,
    commission_bp,
    active: d.active === 'on',
    starts_at: d.starts_at ? new Date(d.starts_at).toISOString() : null,
    ends_at: d.ends_at ? new Date(d.ends_at).toISOString() : null,
    updated_at: new Date().toISOString(),
  }
  // Service role: authenticated holds SELECT only on campaigns (283).
  const admin = createAdminClient()
  const { data, error } = d.id
    ? await admin
        .from('affiliate_campaigns' as never)
        .update(row as never)
        .eq('id', d.id)
        .select('id')
        .single()
    : await admin
        .from('affiliate_campaigns' as never)
        .insert(row as never)
        .select('id')
        .single()
  if (error || !data) redirect('/admin/affiliates/campaigns?error=save_failed')

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: d.id ? 'updated' : 'created',
    entityType: 'affiliate_campaigns',
    entityId: (data as { id: string }).id,
    changes: { old: null, new: row },
  })
  revalidatePath('/admin/affiliates/campaigns')
  redirect('/admin/affiliates/campaigns?saved=1')
}

export async function saveAffiliateCampaign(formData: FormData): Promise<void> {
  return withActionContext('admin.affiliate_campaign.save', () => runSaveCampaign(formData))
}
