'use server'

import { writeAuditLog } from '@/lib/admin/audit'
import { requireSection } from '@/lib/admin/rbac'
import { ilsToAgorot } from '@/lib/commerce/money'
import { withActionContext } from '@/lib/observability/action-context'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'

const PAGE = '/admin/club-tiers'

const schema = z.object({
  id: z.coerce.number().int().positive(),
  name_he: z.string().trim().min(1).max(40),
  // Shekels as typed, converted once through money.ts; never a float.
  min_spend_ils: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,2})?$/),
  benefits: z.string().max(2000),
  sort_order: z.coerce.number().int().min(0).max(10_000),
  cashback_percent: z.coerce.number().int().min(0).max(100),
  early_access_hours: z.coerce.number().int().min(0).max(720),
  gift_value_ils: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,2})?$/),
  active: z.enum(['on']).optional(),
})

async function runUpdateClubTier(formData: FormData): Promise<void> {
  let session: Awaited<ReturnType<typeof requireSection>>
  try {
    session = await requireSection('discounts', 'write')
  } catch {
    redirect(`${PAGE}?error=forbidden`)
  }

  const parsed = schema.safeParse({
    id: formData.get('id'),
    name_he: formData.get('name_he') ?? '',
    min_spend_ils: formData.get('min_spend_ils') ?? '',
    benefits: formData.get('benefits') ?? '',
    sort_order: formData.get('sort_order') ?? '0',
    cashback_percent: formData.get('cashback_percent') ?? '0',
    early_access_hours: formData.get('early_access_hours') ?? '0',
    gift_value_ils: formData.get('gift_value_ils') ?? '0',
    active: formData.get('active') ?? undefined,
  })
  if (!parsed.success) redirect(`${PAGE}?error=invalid`)
  const d = parsed.data

  const benefits = d.benefits
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, 20)

  const patch = {
    name_he: d.name_he,
    min_spend_agorot: ilsToAgorot(d.min_spend_ils),
    benefits_json: benefits,
    sort_order: d.sort_order,
    active: d.active === 'on',
    updated_at: new Date().toISOString(),
  }

  // Service role: club_tiers grants no write to authenticated (282). The
  // section guard above is the authorization.
  const { error } = await createAdminClient()
    .from('club_tiers' as never)
    .update(patch as never)
    .eq('id', d.id)
  if (error) redirect(`${PAGE}?error=save_failed`)

  // Benefit values live in club_tier_benefits (318), one row per tier.
  const benefitPatch = {
    tier_id: d.id,
    cashback_percent: d.cashback_percent,
    early_access_hours: d.early_access_hours,
    gift_value_agorot: ilsToAgorot(d.gift_value_ils),
    updated_at: patch.updated_at,
  }
  const { error: benefitError } = await createAdminClient()
    .from('club_tier_benefits' as never)
    .upsert(benefitPatch as never, { onConflict: 'tier_id' })
  if (benefitError) redirect(`${PAGE}?error=save_failed`)

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'updated',
    entityType: 'club_tiers',
    entityId: String(d.id),
    changes: { old: null, new: { ...patch, ...benefitPatch } },
  })

  revalidatePath(PAGE)
  revalidatePath('/account')
  redirect(`${PAGE}?saved=1`)
}

export async function updateClubTier(formData: FormData): Promise<void> {
  return withActionContext('admin.club_tiers.update', () => runUpdateClubTier(formData))
}
