import FilterBar from '@/components/admin/FilterBar'
import ServerDataTable, { type ServerColumn } from '@/components/admin/ServerDataTable'
import StatusBadge, { orderStatusBadge } from '@/components/admin/StatusBadge'
import TablePagination from '@/components/admin/TablePagination'
import { ORDER_STATUS_LABELS } from '@/lib/admin/labels'
import { baseListParamsSchema, listRange } from '@/lib/admin/list-params'
import { requireSection } from '@/lib/admin/rbac'
import { createClient } from '@/lib/supabase/server'
import type { OrderStatus } from '@/types/database'
import Link from 'next/link'
import { z } from 'zod'

export const metadata = { title: 'הזמנות' }

const ORDER_STATUSES = Object.keys(ORDER_STATUS_LABELS) as OrderStatus[]

const paramsSchema = baseListParamsSchema.extend({
  status: z.enum(ORDER_STATUSES as [OrderStatus, ...OrderStatus[]]).optional(),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
})

type OrderRow = {
  id: string
  invoice_number: string | null
  status: OrderStatus
  total_ils: number
  created_at: string
  customer: string
}

export default async function AdminOrdersPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireSection('orders')

  const raw = await props.searchParams
  const params = paramsSchema.parse(raw)
  const { from: rangeFrom, to: rangeTo } = listRange(params)

  const supabase = await createClient()

  // Free-text search covers invoice number directly; customer name/email
  // resolves through profiles first (orders.user_id -> auth.users, so no
  // direct PostgREST embed filter).
  let matchedUserIds: string[] | null = null
  if (params.q) {
    const { data: matched } = await supabase
      .from('profiles')
      .select('id')
      .or(`full_name.ilike.%${params.q}%,email.ilike.%${params.q}%`)
      .limit(50)
    matchedUserIds = (matched ?? []).map((p) => p.id)
  }

  let query = supabase
    .from('orders')
    .select(
      'id, invoice_number, status, total_ils, created_at, user_id, profiles(full_name, email)',
      {
        count: 'exact',
      },
    )
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range(rangeFrom, rangeTo)

  if (params.status) query = query.eq('status', params.status)
  if (params.from) query = query.gte('created_at', params.from)
  if (params.to) query = query.lte('created_at', `${params.to}T23:59:59`)
  if (params.q) {
    const idList = (matchedUserIds ?? []).map((id) => `user_id.eq.${id}`).join(',')
    query = query.or([`invoice_number.ilike.%${params.q}%`, idList].filter(Boolean).join(','))
  }

  const { data: orders, count, error } = await query

  const rows: OrderRow[] = (orders ?? []).map((order) => {
    const profile = Array.isArray(order.profiles) ? order.profiles[0] : order.profiles
    return {
      id: order.id,
      invoice_number: order.invoice_number,
      status: order.status,
      total_ils: order.total_ils,
      created_at: order.created_at,
      customer: profile?.full_name ?? profile?.email ?? '',
    }
  })

  const urlParams = {
    q: params.q,
    status: params.status,
    from: params.from,
    to: params.to,
    per: params.per,
    page: params.page,
  }

  const columns: ServerColumn<OrderRow>[] = [
    {
      id: 'invoice',
      header: 'מס׳ הזמנה',
      cell: (order) => (
        <Link
          href={`/admin/orders/${order.id}`}
          className="font-mono text-xs text-brand hover:underline"
        >
          {order.invoice_number ?? order.id.slice(0, 8)}
        </Link>
      ),
    },
    { id: 'customer', header: 'לקוח', cell: (order) => order.customer },
    {
      id: 'total',
      header: 'סכום',
      sortKey: 'total_ils',
      cell: (order) => `₪${order.total_ils.toLocaleString('he-IL')}`,
    },
    {
      id: 'status',
      header: 'סטטוס',
      cell: (order) => {
        const badge = orderStatusBadge(order.status)
        return <StatusBadge label={badge.label} variant={badge.variant} />
      },
    },
    {
      id: 'created_at',
      header: 'תאריך',
      sortKey: 'created_at',
      className: 'whitespace-nowrap text-xs text-black/50',
      cell: (order) => new Date(order.created_at).toLocaleDateString('he-IL'),
    },
  ]

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-gray-900">הזמנות</h1>

      <div className="flex flex-wrap items-center gap-2">
        {[undefined, ...ORDER_STATUSES].map((status) => (
          <Link
            key={status ?? 'all'}
            href={status ? `/admin/orders?status=${status}` : '/admin/orders'}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              params.status === status || (!params.status && !status)
                ? 'bg-brand text-brand-dark'
                : 'border border-gray-200 bg-white text-gray-600 hover:border-brand hover:text-brand'
            }`}
          >
            {status ? ORDER_STATUS_LABELS[status] : 'כל הסטטוסים'}
          </Link>
        ))}
      </div>

      <FilterBar
        basePath="/admin/orders"
        searchPlaceholder="חיפוש לפי מס׳ הזמנה, שם או אימייל..."
        defaultQuery={params.q}
        preserve={{ status: params.status, per: params.per }}
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
      </FilterBar>

      {error ? (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          שגיאה בטעינת הזמנות: {error.message}
        </p>
      ) : (
        <>
          <ServerDataTable
            rows={rows}
            columns={columns}
            rowKey={(order) => order.id}
            basePath="/admin/orders"
            params={urlParams}
            emptyMessage="אין הזמנות"
          />
          <TablePagination
            basePath="/admin/orders"
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
