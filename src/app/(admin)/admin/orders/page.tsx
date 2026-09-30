import FilterBar from '@/components/admin/FilterBar'
import ServerDataTable, { type ServerColumn } from '@/components/admin/ServerDataTable'
import StatusBadge, { orderStatusBadge } from '@/components/admin/StatusBadge'
import TablePagination from '@/components/admin/TablePagination'
import OrdersBoard from '@/components/admin/orders/OrdersBoard'
import { ORDER_STATUS_LABELS } from '@/lib/admin/labels'
import { baseListParamsSchema, listRange } from '@/lib/admin/list-params'
import { requireSection } from '@/lib/admin/rbac'
import { shekelsFromIlsRounded } from '@/lib/money-format'
import { createClient } from '@/lib/supabase/server'
import { sanitizeOrTerm } from '@/lib/utils/search-escape'
import { BOARD_LIMIT, loadBoardOrders } from '@/server/queries/fulfillment-board'
import type { OrderStatus } from '@/types/database'
import Link from 'next/link'
import { z } from 'zod'

export const metadata = { title: 'הזמנות' }

const ORDER_STATUSES = Object.keys(ORDER_STATUS_LABELS) as OrderStatus[]

const paramsSchema = baseListParamsSchema.extend({
  // The board is the default (STEP 15); `view=table` keeps the paginated list.
  view: z.enum(['board', 'table']).catch('board'),
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
  couponLines: number
  physicalLines: number
}

/**
 * A coupon order and a physical order are different operations: one issues a
 * voucher that someone has to redeem at a business, the other ships. Without
 * this column the list gave no way to tell them apart before opening each row.
 */
function kindLabel(row: Pick<OrderRow, 'couponLines' | 'physicalLines'>): string {
  if (row.couponLines > 0 && row.physicalLines > 0) return 'מעורב'
  if (row.couponLines > 0) return 'קופון'
  if (row.physicalLines > 0) return 'פיזי'
  return '—'
}

export default async function AdminOrdersPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireSection('orders')

  const raw = await props.searchParams
  const params = paramsSchema.parse(raw)
  const { from: rangeFrom, to: rangeTo } = listRange(params)

  const supabase = await createClient()

  if (params.view === 'board') {
    return (
      <BoardView supabase={supabase} params={{ q: params.q, from: params.from, to: params.to }} />
    )
  }

  // Free-text search covers invoice number directly; customer name/email
  // resolves through profiles first (orders.user_id -> auth.users, so no
  // direct PostgREST embed filter).
  //
  // The term is sanitised before it enters an `.or()`. PostgREST parses that
  // argument as an expression, where , ( ) " and \ are structural, so an
  // operator searching for a business name that contains a comma was not
  // searching for a comma: they were appending a filter condition.
  let matchedUserIds: string[] | null = null
  const searchTerm = params.q ? sanitizeOrTerm(params.q) : ''
  if (searchTerm) {
    const { data: matched } = await supabase
      .from('profiles')
      .select('id')
      .or(`full_name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`)
      .limit(50)
    matchedUserIds = (matched ?? []).map((p) => p.id)
  }

  let query = supabase
    .from('orders')
    .select(
      'id, invoice_number, status, total_ils, created_at, user_id, profiles(full_name, email), order_items(product_type)',
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
  if (searchTerm) {
    const idList = (matchedUserIds ?? []).map((id) => `user_id.eq.${id}`).join(',')
    query = query.or([`invoice_number.ilike.%${searchTerm}%`, idList].filter(Boolean).join(','))
  }

  const { data: orders, count, error } = await query

  const rows: OrderRow[] = (orders ?? []).map((order) => {
    const profile = Array.isArray(order.profiles) ? order.profiles[0] : order.profiles
    const lines = (Array.isArray(order.order_items) ? order.order_items : []) as {
      product_type: string
    }[]
    return {
      id: order.id,
      invoice_number: order.invoice_number,
      status: order.status,
      total_ils: order.total_ils,
      created_at: order.created_at,
      customer: profile?.full_name ?? profile?.email ?? '',
      couponLines: lines.filter((l) => l.product_type === 'coupon').length,
      physicalLines: lines.filter((l) => l.product_type === 'physical').length,
    }
  })

  const urlParams = {
    view: 'table',
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
      id: 'kind',
      header: 'סוג',
      className: 'whitespace-nowrap text-xs text-black/60',
      cell: (order) => kindLabel(order),
    },
    {
      id: 'total',
      header: 'סכום',
      sortKey: 'total_ils',
      cell: (order) => shekelsFromIlsRounded(order.total_ils),
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
      <Heading view="table" />

      <div className="flex flex-wrap items-center gap-2">
        {[undefined, ...ORDER_STATUSES].map((status) => (
          <Link
            key={status ?? 'all'}
            href={status ? `/admin/orders?view=table&status=${status}` : '/admin/orders?view=table'}
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
        preserve={{ view: 'table', status: params.status, per: params.per }}
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

/**
 * The title and the two-way switch between the board and the list. Both
 * views share the page so `/admin/orders` stays the one address the sidebar
 * and every "back to orders" link know.
 */
function Heading({ view }: { view: 'board' | 'table' }) {
  const tab = (active: boolean) =>
    `rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
      active
        ? 'bg-brand text-brand-dark'
        : 'border border-gray-200 bg-white text-gray-600 hover:border-brand hover:text-brand'
    }`
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h1 className="text-xl font-bold text-gray-900">הזמנות</h1>
      <nav aria-label="תצוגה" className="flex items-center gap-2">
        <Link
          href="/admin/orders"
          className={tab(view === 'board')}
          aria-current={view === 'board' ? 'page' : undefined}
        >
          לוח אספקה
        </Link>
        <Link
          href="/admin/orders?view=table"
          className={tab(view === 'table')}
          aria-current={view === 'table' ? 'page' : undefined}
        >
          רשימה
        </Link>
      </nav>
    </div>
  )
}

/**
 * The fulfilment board (STEP 15). The newest BOARD_LIMIT orders that match
 * the search and the date range, laned by `laneFor`; the lane filter is a
 * client concern (the columns ARE the filter), so it is not a URL param here.
 * The CSV link carries the same three filters so the file is the board.
 */
async function BoardView({
  supabase,
  params,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>
  params: { q?: string; from?: string; to?: string }
}) {
  const result = await loadBoardOrders(supabase, params)

  const exportQuery = new URLSearchParams()
  if (params.q) exportQuery.set('q', params.q)
  if (params.from) exportQuery.set('from', params.from)
  if (params.to) exportQuery.set('to', params.to)
  const exportHref = `/api/admin/orders/export${exportQuery.size > 0 ? `?${exportQuery}` : ''}`

  return (
    <div className="space-y-4">
      <Heading view="board" />

      <FilterBar
        basePath="/admin/orders"
        searchPlaceholder="חיפוש לפי מס׳ הזמנה, שם או אימייל..."
        defaultQuery={params.q}
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

      {result.error ? (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          שגיאה בטעינת הזמנות: {result.error}
        </p>
      ) : (
        <>
          {result.orders.length >= BOARD_LIMIT ? (
            <p className="text-xs text-black/50">
              הלוח מציג את {BOARD_LIMIT} ההזמנות האחרונות. לצמצום: חיפוש או טווח תאריכים; הרשימה
              מדפדפת על הכול.
            </p>
          ) : null}
          <OrdersBoard orders={result.orders} exportHref={exportHref} />
        </>
      )}
    </div>
  )
}
