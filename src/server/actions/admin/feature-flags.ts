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
const MAINTENANCE_RETURN_PATHS = ['/admin/feature-flags', '/admin/settings']

async function runSetMaintenance(formData: FormData): Promise<void> {
  // Both /admin/settings and /admin/feature-flags host the toggle; send the
  // admin back to the one they used (allowlisted, never an open redirect).
  const requested = formData.get('return_to')
  const back =
    typeof requested === 'string' && MAINTENANCE_RETURN_PATHS.includes(requested)
      ? requested
      : '/admin/feature-flags'
  let session: Awaited<ReturnType<typeof requireAdminSession>>
  try {
    session = await requireAdminSession()
  } catch {
    redirect(`${back}?error=forbidden`)
  }
  const on = formData.get('maintenance_mode') === 'on'

  // Update Vercel environment variable MAINTENANCE_MODE via CLI
  // Uses authenticated vercel CLI - no API token needed
  try {
    const { exec } = await import('node:child_process')
    const { promisify } = await import('node:util')
    const execAsync = promisify(exec)

    const value = on ? 'on' : 'off'

    // Remove existing var from all targets, then add with new value
    await execAsync(
      `vercel env rm MAINTENANCE_MODE production --yes; vercel env rm MAINTENANCE_MODE preview --yes; vercel env rm MAINTENANCE_MODE development --yes; vercel env add MAINTENANCE_MODE production --value="${value}" --type=config; vercel env add MAINTENANCE_MODE preview --value="${value}" --type=config; vercel env add MAINTENANCE_MODE development --value="${value}" --type=config`,
      { cwd: process.cwd(), shell: '/bin/bash' },
    )
  } catch {
    // Vercel CLI failed - DB write below is the fallback
    // Error swallowed intentionally (toggle still works via DB)
  }

  // Write to DB as fallback (instant updates via cache)
  const { error } = await createAdminClient()
    .from('feature_flags' as never)
    .upsert({
      key: 'maintenance_mode',
      bool_value: on,
      updated_at: new Date().toISOString(),
    } as never)
  if (error) redirect(`${back}?error=save_failed`)

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'updated',
    entityType: 'feature_flags',
    entityId: 'maintenance_mode',
    changes: { old: null, new: { maintenance_mode: on } },
  })
  revalidatePath(back)
  redirect(`${back}?maintenance=${on ? 'on' : 'off'}`)
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
