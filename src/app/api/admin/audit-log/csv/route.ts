import {
  AUDIT_EXPORT_COLUMNS,
  AUDIT_EXPORT_MAX_ROWS,
  type AuditExportRow,
  auditExportParamsSchema,
} from '@/lib/admin/audit-export'
import { requireSection } from '@/lib/admin/rbac'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { csvHeaders, toCsv } from '@/lib/reports/csv'
import { createClient } from '@/lib/supabase/server'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * The audit log as CSV, with the page's filters. Reads on the caller's own
 * session: `audit_log_admin_select` is the policy, so a non-admin session
 * that somehow reached here gets zero rows, not somebody else's log.
 */
async function handleGET(request: NextRequest): Promise<NextResponse> {
  await requireSection('audit-log')

  const search = new URL(request.url).searchParams
  const parsed = auditExportParamsSchema.safeParse({
    action: search.get('action') || undefined,
    entity: search.get('entity') || undefined,
    actor: search.get('actor') || undefined,
    from: search.get('from') || undefined,
    to: search.get('to') || undefined,
  })
  if (!parsed.success) {
    return NextResponse.json({ error: 'מסנן לא תקין' }, { status: 400 })
  }
  const params = parsed.data

  const supabase = await createClient()
  let query = supabase
    .from('audit_log')
    .select(
      'id, created_at, action, entity_type, entity_id, actor_id, actor_role, changes, before, after, request_id',
    )
    .order('created_at', { ascending: false })
    .limit(AUDIT_EXPORT_MAX_ROWS + 1)
  if (params.action) query = query.eq('action', params.action)
  if (params.entity) query = query.eq('entity_type', params.entity)
  if (params.actor) query = query.eq('actor_id', params.actor)
  if (params.from) query = query.gte('created_at', params.from)
  if (params.to) query = query.lte('created_at', `${params.to}T23:59:59`)

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ error: 'לא ניתן להפיק את הלוג כרגע' }, { status: 503 })
  }
  const logs = data ?? []
  if (logs.length > AUDIT_EXPORT_MAX_ROWS) {
    return NextResponse.json(
      { error: 'יותר מ-5000 רשומות; צמצמו את טווח התאריכים' },
      { status: 413 },
    )
  }

  const actorIds = [...new Set(logs.map((l) => l.actor_id).filter(Boolean))] as string[]
  const { data: actors, error: actorsError } = actorIds.length
    ? await supabase.from('profiles').select('id, full_name, email').in('id', actorIds)
    : { data: [], error: null }
  if (actorsError) {
    return NextResponse.json({ error: 'לא ניתן להפיק את הלוג כרגע' }, { status: 503 })
  }
  const actorById = new Map((actors ?? []).map((a) => [a.id, a.full_name ?? a.email]))

  const rows: AuditExportRow[] = logs.map((log) => ({
    id: log.id,
    createdAt: log.created_at,
    action: log.action,
    entityType: log.entity_type,
    entityId: log.entity_id,
    actorName: (log.actor_id && actorById.get(log.actor_id)) || 'מערכת',
    actorRole: log.actor_role,
    changes: log.changes,
    before: log.before,
    after: log.after,
    requestId: log.request_id,
  }))

  const today = new Date().toISOString().slice(0, 10)
  return new NextResponse(toCsv(rows, AUDIT_EXPORT_COLUMNS), {
    headers: csvHeaders(`audit-log-${today}.csv`),
  })
}

export const GET = withRequestLog('/api/admin/audit-log/csv', handleGET)
