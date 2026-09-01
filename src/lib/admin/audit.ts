import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import type { AuditAction, Json, UserRole } from '@/types/database'
import { headers } from 'next/headers'

// Every admin mutation writes an audit_log row through this single helper
// (V2 principle 2: no write without audit). audit_log INSERT is blocked for
// authenticated users by RLS (011), so the service client is the only path.
// Failures are logged, never thrown: an audit hiccup must not break the
// mutation the user already performed.

/**
 * Best effort, and best effort is the point.
 *
 * `audit_log` has carried `ip_address` and `user_agent` columns from the start
 * and this helper never wrote either, so both were null on every row an admin
 * action produced. "Who changed this, and from where" had half an answer.
 *
 * It resolves to null rather than throwing when there is no request context.
 * `writeAuditLog` is called from server actions, which have one, but it is also
 * reachable from a cron route and a script, and an audit row with no IP is
 * worth strictly more than a mutation that fails because it could not find a
 * header.
 *
 * The address is only as trustworthy as the proxy in front: `x-forwarded-for`
 * arrives over the same wire as everything else and is a claim, not a fact,
 * unless something upstream overwrites it. On Vercel it does. That is a
 * property of the deployment, not of this code, and it is the same assumption
 * `getClientIp` in the rate limiter documents at length.
 */
async function requestContext(): Promise<{ ip: string | null; userAgent: string | null }> {
  try {
    const h = await headers()
    const forwarded = h.get('x-forwarded-for')
    const ip = forwarded?.split(',')[0]?.trim() || h.get('x-real-ip') || null
    return { ip, userAgent: h.get('user-agent') }
  } catch {
    return { ip: null, userAgent: null }
  }
}

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
    const { ip, userAgent } = await requestContext()
    const { error } = await admin.from('audit_log').insert({
      actor_id: entry.actorId,
      actor_role: entry.actorRole,
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId ?? null,
      changes: entry.changes ?? null,
      metadata: entry.metadata ?? null,
      // `inet` rejects a malformed value, which would fail the insert and lose
      // the audit row entirely. Anything that is not plainly an address is
      // dropped to null instead: a row without an IP still records who and what.
      ip_address: ip && /^[0-9a-fA-F.:]+$/.test(ip) ? ip : null,
      user_agent: userAgent?.slice(0, 500) ?? null,
    })
    if (error) {
      log.error('audit.write_failed', { reason: error.message })
    }
  } catch (err) {
    log.error('audit.write_threw', { err })
  }
}
