import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import type { AuditAction, Json, UserRole } from '@/types/database'

// Every admin mutation writes an audit_log row through this single helper
// (V2 principle 2: no write without audit). audit_log INSERT is blocked for
// authenticated users by RLS (011), so the service client is the only path.
// Failures are logged, never thrown: an audit hiccup must not break the
// mutation the user already performed.

export async function writeAuditLog(entry: {
  actorId: string
  actorRole: UserRole
  action: AuditAction
  entityType: string
  entityId?: string | null
  changes?: Json
  metadata?: Json
}): Promise<void> {
  try {
    const admin = createAdminClient()
    const { error } = await admin.from('audit_log').insert({
      actor_id: entry.actorId,
      actor_role: entry.actorRole,
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId ?? null,
      changes: entry.changes ?? null,
      metadata: entry.metadata ?? null,
    })
    if (error) {
      log.error('audit.write_failed', { reason: error.message })
    }
  } catch (err) {
    log.error('audit.write_threw', { err })
  }
}
