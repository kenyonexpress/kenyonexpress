'use server'

import { writeAuditLog } from '@/lib/admin/audit'
import { requireAdminSession } from '@/lib/admin/rbac'
import { withActionContext } from '@/lib/observability/action-context'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

/**
 * Turns the storefront's maintenance mode on or off (feature_flags, migration
 * 286). Admin only: it takes every customer-facing page offline. The proxy
 * picks the change up within 30 seconds on each instance.
 */
async function runSetMaintenance(formData: FormData): Promise<void> {
  let session: Awaited<ReturnType<typeof requireAdminSession>>
  try {
    session = await requireAdminSession()
  } catch {
    redirect('/admin/feature-flags?error=forbidden')
  }
  const on = formData.get('maintenance_mode') === 'on'
  const { error } = await createAdminClient()
    .from('feature_flags' as never)
    .upsert({
      key: 'maintenance_mode',
      bool_value: on,
      updated_at: new Date().toISOString(),
    } as never)
  if (error) redirect('/admin/feature-flags?error=save_failed')

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'updated',
    entityType: 'feature_flags',
    entityId: 'maintenance_mode',
    changes: { old: null, new: { maintenance_mode: on } },
  })
  revalidatePath('/admin/feature-flags')
  redirect(`/admin/feature-flags?maintenance=${on ? 'on' : 'off'}`)
}

export async function setMaintenanceMode(formData: FormData): Promise<void> {
  return withActionContext('admin.feature_flags.maintenance', () => runSetMaintenance(formData))
}

/**
 * Toggles a Phase 2 feature flag in the database (migration 293).
 * Admin only: controls feature rollout. The change is picked up within 30
 * seconds on each instance through the cache in getSupabaseFlags.
 */
async function runTogglePhase2Flag(formData: FormData): Promise<void> {
  let session: Awaited<ReturnType<typeof requireAdminSession>>
  try {
    session = await requireAdminSession()
  } catch {
    redirect('/admin/feature-flags?error=forbidden')
  }

  const flagKey = formData.get('flag_key') as string
  const currentValue = formData.get('current_value') === 'true'
  const newValue = !currentValue

  const validKeys = ['physical_products', 'courses_monthly', 'tzimmer_calendar', 'monthly_billing']
  if (!validKeys.includes(flagKey)) {
    redirect('/admin/feature-flags?error=invalid_flag')
  }

  const { error } = await createAdminClient()
    .from('feature_flags' as never)
    .upsert({
      key: flagKey,
      bool_value: newValue,
      updated_at: new Date().toISOString(),
    } as never)

  if (error) redirect('/admin/feature-flags?error=save_failed')

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'updated',
    entityType: 'feature_flags',
    entityId: flagKey,
    changes: { old: { enabled: currentValue }, new: { enabled: newValue } },
  })

  revalidatePath('/admin/feature-flags')
  redirect(`/admin/feature-flags?flag=${flagKey}&state=${newValue ? 'on' : 'off'}`)
}

export async function togglePhase2Flag(formData: FormData): Promise<void> {
  return withActionContext('admin.feature_flags.phase2', () => runTogglePhase2Flag(formData))
}
