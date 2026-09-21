'use server'

import { writeAuditLog } from '@/lib/admin/audit'
import { type AdminSessionInfo, requireSection } from '@/lib/admin/rbac'
import { parseReferralSettingsForm, pickSettings } from '@/lib/admin/referral-settings'
import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export type SettingsActionState = { error: string } | { success: string } | null

/**
 * Writes the one row of `referral_program_settings`.
 *
 * On the service key, after the `payments: write` guard: the table's only
 * policy is `referral_settings_admin_read` (SELECT), measured 22.09.2026, so
 * an admin's own session can read it and not write it. The guard is the
 * authorization; the service key is the transport. The audit row carries the
 * whole before/after so the log's diff column shows which term moved.
 */
async function runUpdateReferralSettings(
  _: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  let session: AdminSessionInfo
  try {
    session = await requireSection('payments', 'write')
  } catch {
    return { error: 'אין הרשאה' }
  }

  const parsed = parseReferralSettingsForm(formData)
  if (!parsed.ok) return { error: parsed.error }

  const admin = createAdminClient()
  const { data: before, error: readError } = await admin
    .from('referral_program_settings' as never)
    .select('*')
    .maybeSingle()
  if (readError) {
    log.error('referral_settings.read_failed', { reason: readError.message })
    return { error: `קריאת ההגדרות נכשלה: ${readError.message}` }
  }

  const { error } = await admin
    .from('referral_program_settings' as never)
    .upsert({ id: true, ...parsed.value, updated_at: new Date().toISOString() } as never, {
      onConflict: 'id',
    })
  if (error) {
    log.error('referral_settings.write_failed', { reason: error.message })
    return { error: `השמירה נכשלה: ${error.message}` }
  }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: before ? 'updated' : 'created',
    entityType: 'referral_program_settings',
    entityId: null,
    changes: { table: 'referral_program_settings' },
    before: pickSettings(before as Record<string, unknown> | null),
    after: parsed.value,
  })

  revalidatePath('/admin/settings')
  revalidatePath('/account/referrals')
  return { success: 'ההגדרות נשמרו' }
}

export async function updateReferralSettings(
  _: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  return withActionContext('admin.settings.update_referral_program', () =>
    runUpdateReferralSettings(_, formData),
  )
}
