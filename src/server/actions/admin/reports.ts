'use server'

import { writeAuditLog } from '@/lib/admin/audit'
import { type AdminSessionInfo, requireAdminSession } from '@/lib/admin/rbac'
import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import { callPendingReportRpc, pendingReportRpc } from '@/lib/supabase/pending-reports'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type ReportsActionState = { error: string } | { success: string } | null

/**
 * Manual rebuild of the reporting tables, for "the numbers look stale"
 * moments between nightly pg_cron runs.
 *
 * The RPC (admin_refresh_reports, migration 170) is SECURITY DEFINER and
 * re-checks is_admin() in the database, so requireAdminSession here is the
 * first gate, not the only one. The refresh rebuilds all four tables in one
 * transaction and returns the new refreshed_at.
 */
async function runRefreshReports(): Promise<ReportsActionState> {
  let session: AdminSessionInfo
  try {
    session = await requireAdminSession()
  } catch {
    return { error: 'אין הרשאה' }
  }

  const supabase = await createClient()
  const result = await callPendingReportRpc<string>(() =>
    supabase.rpc(pendingReportRpc('admin_refresh_reports'), {} as never),
  )

  if (!result.ok) {
    if (result.missing) {
      return {
        error: 'טבלאות הדוחות אינן מותקנות בבסיס הנתונים הזה: מיגרציה 170 לא הוחלה עליו.',
      }
    }
    log.error('admin_reports.refresh_failed', { reason: result.message })
    return { error: 'רענון הדוחות נכשל. נסה שוב.' }
  }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'updated',
    entityType: 'report_tables',
    entityId: 'refresh',
    changes: { refreshed_at: result.rows[0] ?? null },
  })

  revalidatePath('/admin/reports')
  return { success: 'הדוחות רועננו' }
}

export async function refreshReports(): Promise<ReportsActionState> {
  return withActionContext('admin.reports.refresh', () => runRefreshReports())
}
