import ServerDataTable, { type ServerColumn } from '@/components/admin/ServerDataTable'
import TablePagination from '@/components/admin/TablePagination'
import {
  ESCROW_STATUS_LABELS,
  PAYMENT_KIND_LABELS,
  PAYMENT_STATUS_LABELS,
  labelFor,
} from '@/lib/admin/labels'
import { baseListParamsSchema, listRange } from '@/lib/admin/list-params'
import { needsAttention, reconcile, summarize } from '@/lib/admin/payment-reconciliation'
import { requireSection } from '@/lib/admin/rbac'
import { shekelsFromIlsRounded } from '@/lib/money-format'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { EscrowHold, Payment, PaymentWebhookEvent, SplitExecution } from '@/types/database'
import Link from 'next/link'
import { z } from 'zod'
import ReconcileClient from './ReconcileClient'

export const metadata = { title: 'תשלומים' }

const TABS = [
  { key: 'reconcile', label: 'התאמה' },
  { key: 'payments', label: 'תשלומים' },
  { key: 'webhooks', label: 'אירועי Webhook' },
  { key: 'escrow', label: 'החזקות היסטוריות' },
  { key: 'splits', label: 'פיצולים לספקים' },
] as const

type TabKey = (typeof TABS)[number]['key']

const paramsSchema = baseListParamsSchema.extend({
  tab: z.enum(['reconcile', 'payments', 'webhooks', 'escrow', 'splits']).catch('reconcile'),
})

const agorot = (value: number) => shekelsFromIlsRounded(value / 100)

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
  // Shown above the table when the tab needs a sentence the columns cannot say.
  let notice: React.ReactNode = null
  let total = 0

  if (params.tab === 'reconcile') {
    // Reconciliation joins the two tables that were only ever listed apart: a
    // charge can read `succeeded` on one screen while its order reads `pending`
    // on another, and nothing said so. Service role because it spans orders and
    // payments, both of which are money tables with no permissive read.
    const admin = createAdminClient()
    const { data: payments } = await admin
      .from('payments')
      .select('id, order_id, kind, status, amount_ils, succeeded_at, cardcom_transaction_id')
      .order('created_at', { ascending: false })
      .limit(500)

    const orderIds = [
      ...new Set((payments ?? []).map((p) => p.order_id).filter((id): id is string => !!id)),
    ]
    const { data: orders } = await admin
      .from('orders')
      .select('id, status, paid_at')
      .in('id', orderIds.length > 0 ? orderIds : ['00000000-0000-0000-0000-000000000000'])
    const orderById = new Map((orders ?? []).map((o) => [o.id, o]))

    const reconciled = (payments ?? [])
      .filter((p) => p.order_id)
      .map((p) => {
        const order = orderById.get(p.order_id as string)
        return reconcile({
          paymentId: p.id,
          orderId: p.order_id as string,
          paymentStatus: p.status,
          paymentKind: p.kind,
          orderPaidAt: order?.paid_at ?? null,
          orderStatus: order?.status ?? 'unknown',
          amountIls: p.amount_ils,
          succeededAt: p.succeeded_at,
          transactionId: p.cardcom_transaction_id,
        })
      })

    const summary = summarize(reconciled)
    table = <ReconcileClient rows={needsAttention(reconciled)} strandedIls={summary.strandedIls} />
    total = 0
  } else if (params.tab === 'payments') {
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
        cell: (p) => shekelsFromIlsRounded(p.amount_ils),
      },
      {
        id: 'wallet',
        header: 'ארנק',
        cell: (p) => (p.wallet_applied_ils ? shekelsFromIlsRounded(p.wallet_applied_ils) : ''),
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
      { id: 'held', header: 'הוחזק אז', cell: (h) => agorot(h.held_agorot) },
      { id: 'commission', header: 'עמלה', cell: (h) => agorot(h.commission_agorot) },
      // NOT "לשחרור". Nothing here is going to be released, and a future-tense
      // header on a column of real shekels is a promise the product cannot
      // keep. Measured against production 2026-09-08: two rows, both `held`,
      // both against coupon codes, created 2026-07-21 - seven days before
      // migration 085 abolished the mechanism - and this column reads 3420
      // agorot. The supplier portal carried the identical bug and was fixed in
      // src/server/queries/supplier.ts, where the note says adding `held` "told
      // a supplier they were owed money that was never going to arrive". This
      // is the same sentence told to the operator who would answer that
      // supplier.
      { id: 'release', header: 'תוכנן לשחרור (בוטל)', cell: (h) => agorot(h.release_agorot) },
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
        emptyMessage="אין רשומות היסטוריות"
      />
    )
    notice = (
      <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
        <strong className="font-bold">המנגנון הזה בוטל ב-28.07.2026.</strong> הפלטפורמה אינה מחזיקה
        כסף עבור ספקים: תשלום על שובר הוא של הפלטפורמה מרגע התשלום, והיתרה נגבית במזומן בבית העסק.
        הרשומות כאן הן היסטוריה בלבד, הן קדמו לביטול, ו
        <strong className="font-bold">שום סכום בטבלה הזאת לא ישוחרר</strong>. תנאי השימוש אינם
        מזכירים נאמנות, ובצדק.
      </p>
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

      {notice}

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
