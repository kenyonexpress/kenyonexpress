import { requireSection } from '@/lib/admin/rbac'
import { redirect } from 'next/navigation'

/**
 * C68: /admin/audit route - immutable view of system audit log
 *
 * Redirects to /admin/audit-log which provides the full audit log interface.
 * The audit_log table is immutable via RLS (migration 011):
 *   - INSERT/UPDATE/DELETE policies return false (blocked for all users)
 *   - Only admins can SELECT
 *   - All writes happen via SECURITY DEFINER triggers only
 *
 * The audit log captures (via audit_log_trigger_fn in migration 025):
 *   - who: actor_id (the user who made the change)
 *   - what: action (created/updated/deleted), entity_type, entity_id
 *   - before/after: changes jsonb with old/new row snapshots
 *   - at: created_at timestamp
 */
export default async function AuditPage() {
  await requireSection('audit-log')
  redirect('/admin/audit-log')
}
