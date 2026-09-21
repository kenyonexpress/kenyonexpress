import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'

export type BlocklistEntry = {
  id: string
  kind: string
  value: string
  reason: string
  expiresAt: string | null
  createdAt: string
}

const MISSING_TABLE = new Set(['42P01', 'PGRST205', 'PGRST106'])

/** Active entries for the admin panel, newest first. `missing` says 234 is not applied. */
export async function listActiveBlocklist(): Promise<{ rows: BlocklistEntry[]; missing: boolean }> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('fraud_blocklist' as never)
    .select('id, kind, value, reason, expires_at, created_at')
    .is('removed_at', null)
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) {
    if (MISSING_TABLE.has(error.code ?? '')) return { rows: [], missing: true }
    log.warn('fraud.blocklist_list_failed', { reason: error.message })
    return { rows: [], missing: false }
  }
  const rows = (data ?? []) as unknown as {
    id: string
    kind: string
    value: string
    reason: string
    expires_at: string | null
    created_at: string
  }[]
  return {
    rows: rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      value: r.value,
      reason: r.reason,
      expiresAt: r.expires_at,
      createdAt: r.created_at,
    })),
    missing: false,
  }
}
