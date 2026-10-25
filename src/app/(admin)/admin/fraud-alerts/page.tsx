import FilterBar from '@/components/admin/FilterBar'
import ServerDataTable, { type ServerColumn } from '@/components/admin/ServerDataTable'
import TablePagination from '@/components/admin/TablePagination'
import { baseListParamsSchema, listRange } from '@/lib/admin/list-params'
import { requireSection } from '@/lib/admin/rbac'
import { createClient } from '@/lib/supabase/server'
import { sanitizeOrTerm } from '@/lib/utils/search-escape'
import Link from 'next/link'
import { z } from 'zod'

export const metadata = { title: 'התראות הונאה | ניהול' }

const severityOptions = ['low', 'medium', 'high', 'critical'] as const
const statusOptions = ['pending', 'reviewed', 'approved', 'blocked'] as const

const paramsSchema = baseListParamsSchema.extend({
  severity: z.enum(severityOptions).optional(),
  status: z.enum(statusOptions).optional(),
  type: z.string().optional(),
})

const SEVERITY_COLORS = {
  low: 'bg-blue-100 text-blue-700',
  medium: 'bg-yellow-100 text-yellow-700',
  high: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
}

const STATUS_COLORS = {
  pending: 'bg-gray-100 text-gray-700',
  reviewed: 'bg-blue-100 text-blue-700',
  approved: 'bg-green-100 text-green-700',
  blocked: 'bg-red-100 text-red-700',
}

const SEVERITY_LABELS = {
  low: 'נמוך',
  medium: 'בינוני',
  high: 'גבוה',
  critical: 'קריטי',
}

const STATUS_LABELS = {
  pending: 'ממתין',
  reviewed: 'נבדק',
  approved: 'אושר',
  blocked: 'נחסם',
}

const ALERT_TYPE_LABELS: Record<string, string> = {
  order_rate_exceeded: 'חריגה בקצב הזמנות',
  ip_signup_abuse: 'שימוש לרעה ב-IP להרשמה',
  device_bulk_purchase: 'רכישות מרובות מאותו מכשיר',
  disposable_email: 'אימייל זמני',
  duplicate_email: 'אימייל כפול',
}

type AlertRow = {
  id: string
  user_id: string | null
  order_id: string | null
  alert_type: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  status: 'pending' | 'reviewed' | 'approved' | 'blocked'
  details: Record<string, unknown>
  ip_address: string | null
  device_fingerprint: string | null
  created_at: string
  reviewed_at: string | null
  notes: string | null
  userEmail?: string | null
}

export default async function FraudAlertsPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireSection('fraud-alerts')

  const raw = await props.searchParams
  const params = paramsSchema.parse(raw)
  const { from, to } = listRange(params)

  const supabase = await createClient()
  let query = supabase
    .from('fraud_alerts')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to)

  if (params.severity) query = query.eq('severity', params.severity)
  if (params.status) query = query.eq('status', params.status)
  if (params.type) query = query.eq('alert_type', params.type)
  if (params.q) {
    const safeQ = sanitizeOrTerm(params.q)
    if (safeQ) {
      query = query.or(
        `alert_type.ilike.%${safeQ}%,ip_address.ilike.%${safeQ}%,device_fingerprint.ilike.%${safeQ}%`,
      )
    }
  }

  const { data: alerts, count, error } = await query

  // Fetch user emails for alerts
  const userIds = [...new Set((alerts ?? []).map((a) => a.user_id).filter(Boolean))] as string[]
  const { data: profiles } = userIds.length
    ? await supabase.from('profiles').select('id, email').in('id', userIds)
    : { data: [] }
  const emailById = new Map((profiles ?? []).map((p) => [p.id, p.email]))

  const rows: AlertRow[] = (alerts ?? []).map((alert) => ({
    ...alert,
    userEmail: alert.user_id ? emailById.get(alert.user_id) : null,
  }))

  const urlParams = {
    q: params.q,
    severity: params.severity,
    status: params.status,
    type: params.type,
    per: params.per,
    page: params.page,
  }

  const columns: ServerColumn<AlertRow>[] = [
    {
      id: 'severity',
      header: 'חומרה',
      cell: (alert) => (
        <span
          className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${
            SEVERITY_COLORS[alert.severity]
          }`}
        >
          {SEVERITY_LABELS[alert.severity]}
        </span>
      ),
    },
    {
      id: 'type',
      header: 'סוג',
      cell: (alert) => ALERT_TYPE_LABELS[alert.alert_type] ?? alert.alert_type,
    },
    {
      id: 'user',
      header: 'משתמש',
      cell: (alert) => {
        if (!alert.user_id) return '—'
        return (
          <div className="space-y-1">
            <div className="font-mono text-xs text-black/40">{alert.user_id.slice(0, 8)}…</div>
            {alert.userEmail && <div className="text-xs">{alert.userEmail}</div>}
          </div>
        )
      },
    },
    {
      id: 'order',
      header: 'הזמנה',
      cell: (alert) => {
        if (!alert.order_id) return '—'
        return (
          <Link
            href={`/admin/orders/${alert.order_id}`}
            className="font-mono text-xs text-link hover:underline"
          >
            {alert.order_id.slice(0, 8)}…
          </Link>
        )
      },
    },
    {
      id: 'details',
      header: 'פרטים',
      cell: (alert) => {
        const details = alert.details as Record<string, unknown>
        return (
          <div className="max-w-xs space-y-1 text-xs text-black/60">
            {Object.entries(details).map(([key, value]) => (
              <div key={key}>
                <strong>{key}:</strong> {String(value)}
              </div>
            ))}
          </div>
        )
      },
    },
    {
      id: 'ip',
      header: 'IP',
      className: 'font-mono text-xs text-black/50',
      cell: (alert) => alert.ip_address ?? '—',
    },
    {
      id: 'status',
      header: 'סטטוס',
      cell: (alert) => (
        <span
          className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${
            STATUS_COLORS[alert.status]
          }`}
        >
          {STATUS_LABELS[alert.status]}
        </span>
      ),
    },
    {
      id: 'created_at',
      header: 'תאריך',
      className: 'whitespace-nowrap text-xs text-black/50',
      sortKey: 'created_at',
      cell: (alert) => new Date(alert.created_at).toLocaleString('he-IL'),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">התראות הונאה</h1>
        <div className="text-sm text-gray-600">
          סה"כ {count ?? 0} התראות
          {params.status === 'pending' &&
            ` | ${rows.filter((r) => r.status === 'pending').length} ממתינות`}
        </div>
      </div>

      <FilterBar
        basePath="/admin/fraud-alerts"
        searchPlaceholder="חיפוש לפי IP, סוג התראה..."
        defaultQuery={params.q}
        preserve={{ per: params.per }}
      >
        <select
          name="severity"
          defaultValue={params.severity ?? ''}
          className="h-9 rounded-md border border-black/10 bg-surface px-2 text-sm"
        >
          <option value="">כל החומרות</option>
          {severityOptions.map((sev) => (
            <option key={sev} value={sev}>
              {SEVERITY_LABELS[sev]}
            </option>
          ))}
        </select>
        <select
          name="status"
          defaultValue={params.status ?? ''}
          className="h-9 rounded-md border border-black/10 bg-surface px-2 text-sm"
        >
          <option value="">כל הסטטוסים</option>
          {statusOptions.map((stat) => (
            <option key={stat} value={stat}>
              {STATUS_LABELS[stat]}
            </option>
          ))}
        </select>
        <select
          name="type"
          defaultValue={params.type ?? ''}
          className="h-9 rounded-md border border-black/10 bg-surface px-2 text-sm"
        >
          <option value="">כל הסוגים</option>
          {Object.entries(ALERT_TYPE_LABELS).map(([type, label]) => (
            <option key={type} value={type}>
              {label}
            </option>
          ))}
        </select>
      </FilterBar>

      {error ? (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          שגיאה בטעינת ההתראות: {error.message}
        </p>
      ) : (
        <>
          <ServerDataTable
            rows={rows}
            columns={columns}
            rowKey={(alert) => alert.id}
            basePath="/admin/fraud-alerts"
            params={urlParams}
            emptyMessage="אין התראות הונאה"
          />
          <TablePagination
            basePath="/admin/fraud-alerts"
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
