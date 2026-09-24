'use server'

import { CAMPAIGN_FIELDS, parseCampaignForm, pickCampaign } from '@/lib/admin/affiliate-campaigns'
import { writeAuditLog } from '@/lib/admin/audit'
import { type AdminSessionInfo, requireSection } from '@/lib/admin/rbac'
import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import { payAffiliateConversion } from '@/server/affiliates/pay'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

export type CampaignActionState = { error: string } | { success: string } | null

/** Postgres: undefined_table. A database without 244 has no campaigns table. */
const UNDEFINED_TABLE = '42P01'
const NOT_APPLIED =
  'הטבלה עדיין לא קיימת: יש להחיל את migrations/pending/244_affiliate_campaigns.sql'

const CAMPAIGN_SELECT = CAMPAIGN_FIELDS.join(', ')

/**
 * Creates or updates one campaign.
 *
 * On the service key after the `affiliates: write` guard: 244 gives the
 * table an admin SELECT policy and no write policy at all, so an admin's own
 * session can read it and not write it. The guard is the authorization; the
 * service key is the transport; the audit row carries before and after.
 */
async function runSaveAffiliateCampaign(
  _: CampaignActionState,
  formData: FormData,
): Promise<CampaignActionState> {
  let session: AdminSessionInfo
  try {
    session = await requireSection('affiliates', 'write')
  } catch {
    return { error: 'אין הרשאה' }
  }

  const idRaw = String(formData.get('id') ?? '').trim()
  const id = idRaw === '' ? null : idRaw
  if (id && !z.string().uuid().safeParse(id).success) return { error: 'מזהה לא תקין' }

  const parsed = parseCampaignForm(formData)
  if (!parsed.ok) return { error: parsed.error }

  const admin = createAdminClient()
  let before: Record<string, unknown> | null = null
  if (id) {
    const { data, error } = await admin
      .from('affiliate_campaigns' as never)
      .select(CAMPAIGN_SELECT)
      .eq('id', id)
      .maybeSingle()
    if (error) {
      if (error.code === UNDEFINED_TABLE) return { error: NOT_APPLIED }
      log.error('affiliate_campaigns.read_failed', { reason: error.message })
      return { error: `קריאת הקמפיין נכשלה: ${error.message}` }
    }
    if (!data) return { error: 'הקמפיין לא נמצא' }
    before = data as unknown as Record<string, unknown>
  }

  const row = { ...parsed.value, updated_at: new Date().toISOString() }
  const write = id
    ? admin
        .from('affiliate_campaigns' as never)
        .update(row as never)
        .eq('id', id)
        .select('id')
        .maybeSingle()
    : admin
        .from('affiliate_campaigns' as never)
        .insert({ ...row, created_by: session.userId } as never)
        .select('id')
        .maybeSingle()
  const { data: saved, error } = await write
  if (error) {
    if (error.code === UNDEFINED_TABLE) return { error: NOT_APPLIED }
    log.error('affiliate_campaigns.write_failed', { reason: error.message })
    return { error: `השמירה נכשלה: ${error.message}` }
  }
  const savedId = (saved as { id?: string } | null)?.id ?? id

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: id ? 'updated' : 'created',
    entityType: 'affiliate_campaigns',
    entityId: savedId,
    changes: { table: 'affiliate_campaigns' },
    before: pickCampaign(before),
    after: parsed.value,
  })

  revalidatePath('/admin/affiliates')
  revalidatePath('/account/affiliate')
  return { success: id ? 'הקמפיין עודכן' : 'הקמפיין נוצר' }
}

export async function saveAffiliateCampaign(
  _: CampaignActionState,
  formData: FormData,
): Promise<CampaignActionState> {
  return withActionContext('admin.affiliate_campaign.save', () =>
    runSaveAffiliateCampaign(_, formData),
  )
}

const decisionSchema = z.object({
  id: z.string().uuid({ message: 'מזהה לא תקין' }),
  decision: z.enum(['approve', 'reject']),
  reason: z.string().trim().max(300).optional().default(''),
})

/**
 * The two decisions a human makes on a flagged conversion.
 *
 * Approval pays through `payAffiliateConversion`, the same function the
 * finalize path uses for a clean conversion, so the queue's payouts are
 * covered by the same code and the same idempotency key. Rejection flips the
 * row and names the reason; no money moves.
 */
async function runDecideAffiliateConversion(
  _: CampaignActionState,
  formData: FormData,
): Promise<CampaignActionState> {
  let session: AdminSessionInfo
  try {
    session = await requireSection('affiliates', 'write')
  } catch {
    return { error: 'אין הרשאה' }
  }

  const parsed = decisionSchema.safeParse({
    id: formData.get('id'),
    decision: formData.get('decision'),
    reason: formData.get('reason') ?? '',
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'קלט לא תקין' }

  const admin = createAdminClient()
  const { data: row, error: readError } = await admin
    .from('affiliate_conversions' as never)
    .select('id, status, commission_agorot')
    .eq('id', parsed.data.id)
    .maybeSingle()
  if (readError) {
    if (readError.code === UNDEFINED_TABLE) return { error: NOT_APPLIED }
    return { error: `קריאה נכשלה: ${readError.message}` }
  }
  const conversion = row as { id: string; status: string; commission_agorot: number } | null
  if (!conversion) return { error: 'המכירה לא נמצאה' }
  if (conversion.status === 'paid' || conversion.status === 'rejected') {
    return { error: 'המכירה כבר הוכרעה' }
  }

  if (parsed.data.decision === 'approve') {
    const outcome = await payAffiliateConversion(admin, conversion.id, session.userId)
    if (!outcome.ok) return { error: `האישור נכשל: ${outcome.reason}` }
    await writeAuditLog({
      actorId: session.userId,
      actorRole: session.role,
      action: 'status_change',
      entityType: 'affiliate_conversions',
      entityId: conversion.id,
      changes: { status: { from: conversion.status, to: 'paid' } },
      metadata: { commission_agorot: conversion.commission_agorot, outcome: outcome.reason },
    })
    revalidatePath('/admin/affiliates')
    revalidatePath('/account/affiliate')
    return { success: outcome.reason === 'paid' ? 'העמלה זוכתה לארנק' : 'העמלה כבר שולמה' }
  }

  if (!parsed.data.reason) return { error: 'נדרשת סיבת דחייה' }
  const now = new Date().toISOString()
  const { error: rejectError } = await admin
    .from('affiliate_conversions' as never)
    .update({
      status: 'rejected',
      rejection_reason: parsed.data.reason,
      reviewed_by: session.userId,
      reviewed_at: now,
    } as never)
    .eq('id', conversion.id)
    .in('status', ['pending', 'flagged'])
  if (rejectError) return { error: `הדחייה נכשלה: ${rejectError.message}` }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'status_change',
    entityType: 'affiliate_conversions',
    entityId: conversion.id,
    changes: { status: { from: conversion.status, to: 'rejected' } },
    metadata: { reason: parsed.data.reason },
  })
  revalidatePath('/admin/affiliates')
  revalidatePath('/account/affiliate')
  return { success: 'המכירה נדחתה' }
}

export async function decideAffiliateConversion(
  _: CampaignActionState,
  formData: FormData,
): Promise<CampaignActionState> {
  return withActionContext('admin.affiliate_conversion.decide', () =>
    runDecideAffiliateConversion(_, formData),
  )
}
