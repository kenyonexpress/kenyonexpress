import AuditDiffCell from '@/components/admin/AuditDiff'
import FilterBar from '@/components/admin/FilterBar'
import ServerDataTable, { type ServerColumn } from '@/components/admin/ServerDataTable'
import TablePagination from '@/components/admin/TablePagination'
import { AUDIT_ACTION_LABELS, labelFor } from '@/lib/admin/labels'
import { baseListParamsSchema, listRange } from '@/lib/admin/list-params'
import { requireSection } from '@/lib/admin/rbac'
import { createClient } from '@/lib/supabase/server'
import { sanitizeOrTerm } from '@/lib/utils/search-escape'
import type { AuditAction, AuditLog } from '@/types/database'
import { z } from 'zod'

export const metadata = { title: 'לוג פעילות' }

const AUDIT_ACTIONS = Object.keys(AUDIT_ACTION_LABELS) as AuditAction[]

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

const paramsSchema = baseListParamsSchema.extend({
  action: z.enum(AUDIT_ACTIONS as [AuditAction, ...AuditAction[]]).optional(),
  entity: z.string().trim().max(40).optional(),
  // Who did it. A uuid, because the value comes from the actor list below
  // rather than being typed: matching a name here would silently drop every
  // action by a person whose profile has no full_name.
  actor: z.string().uuid().optional(),
  from: z.string().regex(ISO_DATE).optional(),
  to: z.string().regex(ISO_DATE).optional(),
})

const ACTION_COLORS: Partial<Record<AuditAction, string>> = {
  created: 'bg-green-100 text-green-700',
  updated: 'bg-blue-100 text-blue-700',
  deleted: 'bg-red-100 text-red-700',
  restored: 'bg-teal-100 text-teal-700',
  permission_change: 'bg-purple-100 text-purple-700',
  status_change: 'bg-amber-100 text-amber-800',
  manual_override: 'bg-red-100 text-red-700',
}

const ENTITY_LABELS: Record<string, string> = {
  products: 'מוצרים',
  product: 'מוצר',
  categories: 'קטגוריות',
  category: 'קטגוריה',
  vendors: 'ספקים',
  suppliers: 'ספקים',
  profiles: 'משתמשים',
  orders: 'הזמנות',
  order: 'הזמנה',
  coupons: 'קופונים',
  coupon_deals: 'דילים',
  coupon_codes: 'קודי קופון',
  payments: 'תשלומים',
  wallet: 'ארנק',
  affiliates: 'שותפים',
}

type LogRow = AuditLog & { actorName: string }

export default async function AuditLogPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireSection('audit-log')

  const raw = await props.searchParams
  const params = paramsSchema.parse(raw)
  const { from, to } = listRange(params)

  const supabase = await createClient()
  let query = supabase
    .from('audit_log')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to)
  if (params.action) query = query.eq('action', params.action)
  if (params.entity) query = query.eq('entity_type', params.entity)
  if (params.actor) query = query.eq('actor_id', params.actor)
  if (params.from) query = query.gte('created_at', params.from)
  // End of day, not start: `to=2026-09-01` has to include what happened on the
  // 1st, or a single-day range returns nothing and reads as "no activity".
  if (params.to) query = query.lte('created_at', `${params.to}T23:59:59`)
  // See the note in the users page: a raw term in an `.or()` expression is
  // filter syntax, not a value.
  if (params.q) {
    const safeQ = sanitizeOrTerm(params.q)
    if (safeQ) query = query.or(`entity_type.ilike.%${safeQ}%,actor_role.ilike.%${safeQ}%`)
  }

  const { data: logs, count, error } = await query

  // actor_id points at auth.users, so PostgREST cannot embed profiles here;
  // resolve display names with one batched lookup instead.
  const actorIds = [...new Set((logs ?? []).map((l) => l.actor_id).filter(Boolean))] as string[]
  const { data: actors } = actorIds.length
    ? await supabase.from('profiles').select('id, full_name, email').in('id', actorIds)
    : { data: [] }
  const actorById = new Map((actors ?? []).map((a) => [a.id, a.full_name ?? a.email]))

  const rows: LogRow[] = (logs ?? []).map((log) => ({
    ...log,
    actorName: (log.actor_id && actorById.get(log.actor_id)) || 'מערכת',
  }))

  const urlParams = {
    q: params.q,
    action: params.action,
    entity: params.entity,
    actor: params.actor,
    from: params.from,
    to: params.to,
    per: params.per,
    page: params.page,
  }

  const columns: ServerColumn<LogRow>[] = [
    {
      id: 'action',
      header: 'פעולה',
      cell: (log) => (
        <span
          className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${
            ACTION_COLORS[log.action] ?? 'bg-gray-100 text-gray-600'
          }`}
        >
          {labelFor(AUDIT_ACTION_LABELS, log.action)}
        </span>
      ),
    },
    {
      id: 'entity',
      header: 'ישות',
      cell: (log) => ENTITY_LABELS[log.entity_type] ?? log.entity_type,
    },
    {
      id: 'entity_id',
      header: 'מזהה',
      className: 'font-mono text-xs text-black/40',
      cell: (log) => (log.entity_id ? `${log.entity_id.slice(0, 8)}…` : ''),
    },
    {
      // The reason this page exists. `changes` holds two whole row snapshots,
      // so without a diff the answer to "what did they change" was sitting in
      // the database and shown nowhere.
      id: 'changes',
      header: 'שינויים',
      cell: (log) => <AuditDiffCell changes={log.changes} />,
    },
    { id: 'actor', header: 'משתמש', cell: (log) => log.actorName },
    {
      id: 'actor_role',
      header: 'תפקיד',
      className: 'text-xs text-black/50',
      cell: (log) => log.actor_role ?? '',
    },
    {
      id: 'created_at',
      header: 'תאריך',
      className: 'whitespace-nowrap text-xs text-black/50',
      sortKey: 'created_at',
      cell: (log) => new Date(log.created_at).toLocaleString('he-IL'),
    },
  ]

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-gray-900">לוג פעילות</h1>

      <FilterBar
        basePath="/admin/audit-log"
        searchPlaceholder="חיפוש לפי ישות או תפקיד..."
        defaultQuery={params.q}
        preserve={{ per: params.per, actor: params.actor }}
      >
        <input
          name="from"
          type="date"
          defaultValue={params.from ?? ''}
          className="h-9 rounded-md border border-black/10 bg-surface px-2 text-sm"
          aria-label="מתאריך"
        />
        <input
          name="to"
          type="date"
          defaultValue={params.to ?? ''}
          className="h-9 rounded-md border border-black/10 bg-surface px-2 text-sm"
          aria-label="עד תאריך"
        />
        <select
          name="action"
          defaultValue={params.action ?? ''}
          className="h-9 rounded-md border border-black/10 bg-surface px-2 text-sm"
        >
          <option value="">כל הפעולות</option>
          {AUDIT_ACTIONS.map((action) => (
            <option key={action} value={action}>
              {AUDIT_ACTION_LABELS[action]}
            </option>
          ))}
        </select>
      </FilterBar>

      {error ? (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          שגיאה בטעינת הלוג: {error.message}
        </p>
      ) : (
        <>
          <ServerDataTable
            rows={rows}
            columns={columns}
            rowKey={(log) => log.id}
            basePath="/admin/audit-log"
            params={urlParams}
            emptyMessage="אין פעולות רשומות"
          />
          <TablePagination
            basePath="/admin/audit-log"
            params={urlParams}
            page={params.page}
            perPage={params.per}
            total={count ?? 0}
          />
        </>
      )}
    </div>
  )
}
