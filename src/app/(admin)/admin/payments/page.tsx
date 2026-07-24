import ServerDataTable, { type ServerColumn } from '@/components/admin/ServerDataTable'
import TablePagination from '@/components/admin/TablePagination'
import {
  ESCROW_STATUS_LABELS,
  PAYMENT_KIND_LABELS,
  PAYMENT_STATUS_LABELS,
  labelFor,
} from '@/lib/admin/labels'
import { baseListParamsSchema, listRange } from '@/lib/admin/list-params'
import { requireSection } from '@/lib/admin/rbac'
import { createClient } from '@/lib/supabase/server'
import type { EscrowHold, Payment, PaymentWebhookEvent, SplitExecution } from '@/types/database'
import Link from 'next/link'
import { z } from 'zod'

export const metadata = { title: 'תשלומים' }

const TABS = [
  { key: 'payments', label: 'תשלומים' },
  { key: 'webhooks', label: 'אירועי Webhook' },
  { key: 'escrow', label: 'נאמנות (Escrow)' },
  { key: 'splits', label: 'פיצולים לספקים' },
] as const

type TabKey = (typeof TABS)[number]['key']

const paramsSchema = baseListParamsSchema.extend({
  tab: z.enum(['payments', 'webhooks', 'escrow', 'splits']).catch('payments'),
})

const agorot = (value: number) => `₪${(value / 100).toLocaleString('he-IL')}`

const PAYMENT_STATUS_COLORS: Record<string, string> = {
  succeeded: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  refunded: 'bg-amber-100 text-amber-800',
  initiated: 'bg-gray-100 text-gray-600',
  redirected: 'bg-blue-100 text-blue-700',
}

export default async function AdminPaymentsPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireSection('payments')

  const raw = await props.searchParams
  const params = paramsSchema.parse(raw)
  const { from, to } = listRange(params)
  const supabase = await createClient()

  const urlParams = { tab: params.tab, per: params.per, page: params.page }
  let table: React.ReactNode = null
  let total = 0

  if (params.tab === 'payments') {
    const { data, count } = await supabase
      .from('payments')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to)
    total = count ?? 0
    const columns: ServerColumn<Payment>[] = [
      {
        id: 'order',
        header: 'הזמנה',
        cell: (p) => (
          <Link
            href={`/admin/orders/${p.order_id}`}
            className="font-mono text-xs text-brand hover:underline"
          >
            {p.order_id.slice(0, 8)}
          </Link>
        ),
      },
      { id: 'kind', header: 'סוג', cell: (p) => labelFor(PAYMENT_KIND_LABELS, p.kind) },
      {
        id: 'status',
        header: 'סטטוס',
        cell: (p) => (
          <span
            className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${
              PAYMENT_STATUS_COLORS[p.status] ?? 'bg-gray-100 text-gray-600'
            }`}
          >
            {labelFor(PAYMENT_STATUS_LABELS, p.status)}
          </span>
        ),
      },
      {
        id: 'amount',
        header: 'סכום',
        sortKey: 'amount_ils',
        cell: (p) => `₪${p.amount_ils.toLocaleString('he-IL')}`,
      },
      {
        id: 'wallet',
        header: 'ארנק',
        cell: (p) =>
          p.wallet_applied_ils ? `₪${p.wallet_applied_ils.toLocaleString('he-IL')}` : '',
      },
      {
        id: 'cardcom',
        header: 'עסקת Cardcom',
        className: 'font-mono text-xs text-black/40',
        cell: (p) => p.cardcom_transaction_id ?? '',
      },
      {
        id: 'failure',
        header: 'שגיאה',
        className: 'text-xs text-red-600',
        cell: (p) => p.failure_message ?? '',
      },
      {
        id: 'created_at',
        header: 'תאריך',
        sortKey: 'created_at',
        className: 'whitespace-nowrap text-xs text-black/50',
        cell: (p) => new Date(p.created_at).toLocaleString('he-IL'),
      },
    ]
    table = (
      <ServerDataTable
        rows={data ?? []}
        columns={columns}
        rowKey={(p) => p.id}
        basePath="/admin/payments"
        params={urlParams}
        emptyMessage="אין תשלומים"
      />
    )
  } else if (params.tab === 'webhooks') {
    const { data, count } = await supabase
      .from('payment_webhook_events')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to)
    total = count ?? 0
    const columns: ServerColumn<PaymentWebhookEvent>[] = [
      { id: 'provider', header: 'ספק', cell: (e) => e.provider },
      {
        id: 'event',
        header: 'מזהה אירוע',
        className: 'font-mono text-xs',
        cell: (e) => e.external_event_id,
      },
      {
        id: 'signature',
        header: 'חתימה',
        cell: (e) =>
          e.signature_valid ? (
            <span className="text-green-700">תקינה</span>
          ) : (
            <span className="font-medium text-red-600">לא תקינה</span>
          ),
      },
      {
        id: 'verified',
        header: 'אומת מול API',
        cell: (e) => (e.verified_against_api ? 'כן' : 'לא'),
      },
      {
        id: 'processed',
        header: 'טופל',
        className: 'text-xs text-black/50',
        cell: (e) => (e.processed_at ? new Date(e.processed_at).toLocaleString('he-IL') : 'טרם'),
      },
      {
        id: 'created_at',
        header: 'התקבל',
        sortKey: 'created_at',
        className: 'whitespace-nowrap text-xs text-black/50',
        cell: (e) => new Date(e.created_at).toLocaleString('he-IL'),
      },
    ]
    table = (
      <ServerDataTable
        rows={data ?? []}
        columns={columns}
        rowKey={(e) => e.id}
        basePath="/admin/payments"
        params={urlParams}
        emptyMessage="אין אירועי webhook"
      />
    )
  } else if (params.tab === 'escrow') {
    const { data, count } = await supabase
      .from('escrow_holds')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to)
    total = count ?? 0
    const columns: ServerColumn<EscrowHold>[] = [
      {
        id: 'order',
        header: 'הזמנה',
        cell: (h) => (
          <Link
            href={`/admin/orders/${h.order_id}`}
            className="font-mono text-xs text-brand hover:underline"
          >
            {h.order_id.slice(0, 8)}
          </Link>
        ),
      },
      { id: 'held', header: 'מוחזק', cell: (h) => agorot(h.held_agorot) },
      { id: 'commission', header: 'עמלה', cell: (h) => agorot(h.commission_agorot) },
      { id: 'release', header: 'לשחרור', cell: (h) => agorot(h.release_agorot) },
      {
        id: 'status',
        header: 'סטטוס',
        cell: (h) => labelFor(ESCROW_STATUS_LABELS, h.status),
      },
      {
        id: 'released_at',
        header: 'שוחרר',
        className: 'text-xs text-black/50',
        cell: (h) => (h.released_at ? new Date(h.released_at).toLocaleString('he-IL') : ''),
      },
      {
        id: 'held_at',
        header: 'הוחזק',
        sortKey: 'created_at',
        className: 'whitespace-nowrap text-xs text-black/50',
        cell: (h) => new Date(h.held_at).toLocaleString('he-IL'),
      },
    ]
    table = (
      <ServerDataTable
        rows={data ?? []}
        columns={columns}
        rowKey={(h) => h.id}
        basePath="/admin/payments"
        params={urlParams}
        emptyMessage="אין החזקות נאמנות"
      />
    )
  } else {
    const { data, count } = await supabase
      .from('split_executions')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to)
    total = count ?? 0
    const columns: ServerColumn<SplitExecution>[] = [
      {
        id: 'order',
        header: 'הזמנה',
        cell: (s) => (
          <Link
            href={`/admin/orders/${s.order_id}`}
            className="font-mono text-xs text-brand hover:underline"
          >
            {s.order_id.slice(0, 8)}
          </Link>
        ),
      },
      { id: 'face', header: 'ערך מלא', cell: (s) => agorot(s.face_value_agorot) },
      { id: 'supplier', header: 'לספק', cell: (s) => agorot(s.supplier_agorot) },
      { id: 'commission', header: 'עמלת פלטפורמה', cell: (s) => agorot(s.commission_agorot) },
      {
        id: 'executed_at',
        header: 'בוצע',
        sortKey: 'created_at',
        className: 'whitespace-nowrap text-xs text-black/50',
        cell: (s) => new Date(s.executed_at).toLocaleString('he-IL'),
      },
    ]
    table = (
      <ServerDataTable
        rows={data ?? []}
        columns={columns}
        rowKey={(s) => s.id}
        basePath="/admin/payments"
        params={urlParams}
        emptyMessage="אין פיצולים"
      />
    )
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-gray-900">תשלומים והתאמות</h1>

      <div className="flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            href={`/admin/payments?tab=${tab.key}`}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              params.tab === (tab.key as TabKey)
                ? 'bg-brand text-brand-dark'
                : 'border border-gray-200 bg-white text-gray-600 hover:border-brand hover:text-brand'
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {table}

      <TablePagination
        basePath="/admin/payments"
        params={urlParams}
        page={params.page}
        perPage={params.per}
        total={total}
      />
    </div>
  )
}
