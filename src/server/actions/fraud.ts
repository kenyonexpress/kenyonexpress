'use server'

import { requireAdminPage } from '@/lib/admin/rbac'
import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const updateAlertSchema = z.object({
  alertId: z.string().uuid(),
  status: z.enum(['pending', 'reviewed', 'approved', 'blocked']),
  notes: z.string().optional(),
})

export type UpdateAlertState = { error: string } | { success: true } | null

async function runUpdateFraudAlert(
  _: UpdateAlertState,
  formData: FormData,
): Promise<UpdateAlertState> {
  // Only admins can update fraud alerts
  await requireAdminPage()

  const parsed = updateAlertSchema.safeParse({
    alertId: formData.get('alert_id'),
    status: formData.get('status'),
    notes: formData.get('notes'),
  })

  if (!parsed.success) {
    return { error: 'נתונים לא תקינים' }
  }

  const { alertId, status, notes } = parsed.data

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'נדרשת התחברות' }
  }

  const admin = createAdminClient()

  const { error } = await admin
    .from('fraud_alerts')
    .update({
      status,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      ...(notes ? { notes } : {}),
    })
    .eq('id', alertId)

  if (error) {
    log.error('fraud.update_alert_failed', {
      alertId,
      error: error.message,
    })
    return { error: 'עדכון ההתראה נכשל' }
  }

  log.info('fraud.alert_updated', { alertId, status, reviewedBy: user.id })
  return { success: true }
}

export async function updateFraudAlert(
  prev: UpdateAlertState,
  formData: FormData,
): Promise<UpdateAlertState> {
  return withActionContext('fraud.update_alert', () => runUpdateFraudAlert(prev, formData))
}
