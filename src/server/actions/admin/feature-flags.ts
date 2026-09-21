'use server'

import { writeAuditLog } from '@/lib/admin/audit'
import { type AdminSessionInfo, requireSection } from '@/lib/admin/rbac'
import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import { isFeatureFlagKey } from '@/lib/resilience/feature-flags'
import { createAdminClient } from '@/lib/supabase/admin'
import { forgetFeatureFlags } from '@/server/resilience/flags'
import { revalidatePath } from 'next/cache'

export type FlagActionState = { error: string } | { success: string } | null

const MISSING_TABLE = new Set(['42P01', 'PGRST205', 'PGRST106'])

async function runSetFeatureFlag(_: FlagActionState, formData: FormData): Promise<FlagActionState> {
  let session: AdminSessionInfo
  try {
    session = await requireSection('analytics', 'write')
  } catch {
    return { error: 'אין הרשאה' }
  }
  const key = formData.get('key')
  const enabled = formData.get('enabled') === 'true'
  if (!isFeatureFlagKey(key)) return { error: 'דגל לא מוכר.' }
  const admin = createAdminClient()
  const { error } = await admin
    .from('feature_flags' as never)
    .upsert(
      { key, enabled, updated_by: session.userId, updated_at: new Date().toISOString() } as never,
      {
        onConflict: 'key',
      },
    )
  if (error) {
    if (MISSING_TABLE.has(error.code ?? '')) {
      return { error: 'הטבלה עדיין לא הוחלה: migrations/pending/235_feature_flags.sql' }
    }
    log.warn('admin.feature_flag_write_failed', { key, reason: error.message })
    return { error: 'השמירה נכשלה.' }
  }
  forgetFeatureFlags()
  await writeAuditLog({
    actorId: session.userId,
    actorRole: 'admin',
    action: 'updated',
    entityType: 'feature_flag',
    entityId: key,
    changes: { enabled },
  })
  revalidatePath('/admin/feature-flags')
  return { success: `${key}: ${enabled ? 'דלוק' : 'כבוי'}. הסביבה גוברת אם היא מגדירה ערך.` }
}

export async function setFeatureFlag(
  state: FlagActionState,
  formData: FormData,
): Promise<FlagActionState> {
  return withActionContext('admin.feature_flag.set', () => runSetFeatureFlag(state, formData))
}
