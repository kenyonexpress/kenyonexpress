'use server'

import { writeAuditLog } from '@/lib/admin/audit'
import { requireAdminSession } from '@/lib/admin/rbac'
import { withActionContext } from '@/lib/observability/action-context'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

/**
 * Turns the storefront's maintenance mode on or off by setting MAINTENANCE_MODE
 * Vercel env var. Admin only: it takes every customer-facing page offline.
 * Also writes to DB as fallback. Changes take effect on next middleware invocation.
 */
async function runSetMaintenance(formData: FormData): Promise<void> {
  let session: Awaited<ReturnType<typeof requireAdminSession>>
  try {
    session = await requireAdminSession()
  } catch {
    redirect('/admin/feature-flags?error=forbidden')
  }
  const on = formData.get('maintenance_mode') === 'on'

  // Update Vercel environment variable MAINTENANCE_MODE (always attempted)
  const vercelToken = process.env.VERCEL_API_TOKEN || ''
  const vercelProjectId = process.env.VERCEL_PROJECT_ID || 'kenyonexpress'
  const vercelTeamId = process.env.VERCEL_TEAM_ID

  try {
    // Find existing MAINTENANCE_MODE env var ID
    const listUrl = vercelTeamId
      ? `https://api.vercel.com/v9/projects/${vercelProjectId}/env?teamId=${vercelTeamId}`
      : `https://api.vercel.com/v9/projects/${vercelProjectId}/env`

    const listRes = await fetch(listUrl, {
      headers: { Authorization: `Bearer ${vercelToken}` },
    })

    if (listRes.ok) {
      const { envs } = (await listRes.json()) as { envs: Array<{ id: string; key: string }> }
      const existing = envs.find((e) => e.key === 'MAINTENANCE_MODE')

      if (existing) {
        // Update existing env var
        const updateUrl = vercelTeamId
          ? `https://api.vercel.com/v9/projects/${vercelProjectId}/env/${existing.id}?teamId=${vercelTeamId}`
          : `https://api.vercel.com/v9/projects/${vercelProjectId}/env/${existing.id}`

        await fetch(updateUrl, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${vercelToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            value: on ? 'on' : 'off',
            type: 'plain',
            target: ['production', 'preview', 'development'],
          }),
        })
      }
    }
  } catch (vercelError) {
    // Log but don't fail - DB write below is the fallback
    console.error('Vercel env update failed:', vercelError)
  }

  // Write to DB as fallback (instant updates via cache)
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
