import ServerDataTable, { type ServerColumn } from '@/components/admin/ServerDataTable'
import StatusBadge from '@/components/admin/StatusBadge'
import TablePagination from '@/components/admin/TablePagination'
import { baseListParamsSchema, listRange } from '@/lib/admin/list-params'
import {
  PAYOUT_STATE_LABELS,
  PAYOUT_STATE_VARIANTS,
  isHeld,
  payoutState,
  shekels,
} from '@/lib/admin/payouts'
import { requireSection } from '@/lib/admin/rbac'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'
import GeneratePayoutClient from './GeneratePayoutClient'
import PayoutActionsClient from './PayoutActionsClient'

export const metadata = { title: 'תשלומים לספקים' }

const paramsSchema = baseListParamsSchema.extend({
  state: z.enum(['all', 'open', 'rolled_over', 'paid']).catch('all'),
})

type StatementRow = {
  id: string
  statement_number: string
  supplier_id: string
  period_start: string
  period_end: string
  status: string
  rolled_over: boolean | null
  available_at: string | null
  total_gross_ils: string | number | null
  total_platform_fee_ils: string | number | null
  total_payout_ils: string | number | null
  min_payout_ils: string | number | null
  payment_reference: string | null
  paid_at: string | null
  suppliers: { name: string } | { name: string }[] | null
}

const FILTERS = [
  { key: 'all', label: 'הכל' },
  { key: 'open', label: 'פתוחים' },
  { key: 'rolled_over', label: 'מתגלגלים' },
  { key: 'paid', label: 'שולמו' },
] as const

/** Previous whole calendar month: the period a run is almost always for. */
function lastMonth(today = new Date()): { start: string; end: string } {
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1))
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0))
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  return { start: iso(start), end: iso(end) }
}

const he = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('he-IL') : '—')

export default async function AdminPayoutsPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireSection('payments')

  const params = paramsSchema.parse(await props.searchParams)
  const { from, to } = listRange(params)
  const supabase = await createClient()

  let query = supabase
    .from('payout_statements')
    .select(
      `id, statement_number, supplier_id, period_start, period_end, status, rolled_over,
       available_at, total_gross_ils, total_platform_fee_ils, total_payout_ils,
       min_payout_ils, payment_reference, paid_at, suppliers(name)`,
      { count: 'exact' },
    )
    .is('deleted_at', null)

  // 'open' is everything still owed and actionable. It deliberately excludes
  // rolled-over runs: their lines were deleted so the next run can collect the
  // same order items, so there is nothing on them left to act on.
  if (params.state === 'open') {
    query = query.in('status', ['draft', 'pending_approval', 'approved'])
  } else if (params.state === 'rolled_over') {
    query = query.eq('rolled_over', true)
  } else if (params.state === 'paid') {
    query = query.eq('status', 'paid')
  }

  const { data, count } = await query
    .order('period_start', { ascending: false })
    .order('created_at', { ascending: false })
    .range(from, to)

  const rows = (data ?? []) as StatementRow[]
  const total = count ?? 0

  const { data: supplierRows } = await supabase
    .from('suppliers')
    .select('id, name, min_payout_ils')
    .eq('status', 'active')
    .order('name')

  const period = lastMonth()

  const supplierName = (row: StatementRow) =>
    (Array.isArray(row.suppliers) ? row.suppliers[0]?.name : row.suppliers?.name) ?? '—'

  const columns: ServerColumn<StatementRow>[] = [
    {
      id: 'statement',
      header: 'דוח',
      cell: (row) => (
        <div>
          <span className="font-medium text-gray-900">{row.statement_number}</span>
          <span className="block text-xs text-gray-500">{supplierName(row)}</span>
        </div>
      ),
    },
    {
      id: 'period',
      header: 'תקופה',
      cell: (row) => (
        <span className="text-xs text-gray-600">
          {he(row.period_start)} – {he(row.period_end)}
        </span>
      ),
    },
    {
      id: 'state',
      header: 'סטטוס',
      cell: (row) => {
        const state = payoutState(row)
        return (
          <div className="flex flex-col gap-1">
            <StatusBadge
              label={PAYOUT_STATE_LABELS[state]}
              variant={PAYOUT_STATE_VARIANTS[state]}
            />
            {isHeld(row) && (
              <span className="text-xs text-gray-500">משוחרר ב-{he(row.available_at)}</span>
            )}
          </div>
        )
      },
    },
    {
      id: 'gross',
      header: 'ברוטו',
      cell: (row) => <span className="tabular-nums">{shekels(row.total_gross_ils)}</span>,
    },
    {
      id: 'fee',
      header: 'עמלת פלטפורמה',
      cell: (row) => (
        <span className="tabular-nums text-gray-600">{shekels(row.total_platform_fee_ils)}</span>
      ),
    },
    {
      id: 'payout',
      header: 'לתשלום לספק',
      cell: (row) => (
        <div>
          <span className="font-semibold tabular-nums">{shekels(row.total_payout_ils)}</span>
          {payoutState(row) === 'rolled_over' && (
            <span className="block text-xs text-gray-500">
              מתחת למינימום {shekels(row.min_payout_ils)}
            </span>
          )}
        </div>
      ),
    },
    {
      id: 'paid',
      header: 'תשלום',
      cell: (row) =>
        row.paid_at ? (
          <div className="text-xs text-gray-600">
            <span className="block">{he(row.paid_at)}</span>
            <span className="block font-mono">{row.payment_reference ?? '—'}</span>
          </div>
        ) : (
          <span className="text-xs text-gray-400">—</span>
        ),
    },
    {
      id: 'actions',
      header: '',
      cell: (row) => (
        <PayoutActionsClient
          statementId={row.id}
          statementNumber={row.statement_number}
          status={row.status}
          rolledOver={row.rolled_over ?? false}
          availableAt={row.available_at}
        />
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">תשלומים לספקים</h1>
        <p className="mt-1 text-sm text-gray-500">
          ריצות תשלום לפי הפיצול שצולם בזמן ההזמנה. הכסף יוצא רק אחרי אישור מפורש, ורק אחרי שכל שורה
          עברה 3 ימי עסקים מהמסירה.
        </p>
      </div>

      <GeneratePayoutClient
        suppliers={supplierRows ?? []}
        defaultStart={period.start}
        defaultEnd={period.end}
      />

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <a
            key={f.key}
            href={`/admin/payouts?state=${f.key}`}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              params.state === f.key
                ? 'bg-brand-dark text-white'
                : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {f.label}
          </a>
        ))}
      </div>

      <ServerDataTable
        rows={rows}
        columns={columns}
        rowKey={(row) => row.id}
        basePath="/admin/payouts"
        params={{ state: params.state, per: params.per, page: params.page }}
        emptyMessage="אין ריצות תשלום בטווח הזה"
      />

      <TablePagination
        basePath="/admin/payouts"
        params={{ state: params.state, per: params.per, page: params.page }}
        page={params.page}
        perPage={params.per}
        total={total}
      />
    </div>
  )
}
