import FilterBar from '@/components/admin/FilterBar'
import ServerDataTable, { type ServerColumn } from '@/components/admin/ServerDataTable'
import StatsCard from '@/components/admin/StatsCard'
import StatusBadge from '@/components/admin/StatusBadge'
import TablePagination from '@/components/admin/TablePagination'
import { baseListParamsSchema, listRange } from '@/lib/admin/list-params'
import { requireSection } from '@/lib/admin/rbac'
import {
  VOUCHER_STATUS_LABELS,
  VOUCHER_STATUS_VARIANTS,
  type VoucherStatus,
  countVouchers,
  formatVoucherCode,
  isLapsedButUnswept,
} from '@/lib/admin/voucher-view'
import { createAdminClient } from '@/lib/supabase/admin'
import { AlertTriangle, CalendarX, QrCode, ScanLine, Ticket } from 'lucide-react'
import Link from 'next/link'
import { z } from 'zod'

export const metadata = { title: 'שוברים' }

/**
 * Issued vouchers and their scan status.
 *
 * Reads `public.vouchers`, the table `finalize.ts` issues into and the customer
 * account and refund path both read. This screen used to read
 * `public.coupon_codes`, which is read-only everywhere in the tree and holds two
 * rows predating the voucher cutover: the admin was looking at a dead table
 * while real vouchers accumulated elsewhere. Same failure as /admin/suppliers
 * editing `vendors`.
 */

const VOUCHER_STATUSES = Object.keys(VOUCHER_STATUS_LABELS) as VoucherStatus[]

const paramsSchema = baseListParamsSchema.extend({
  status: z.enum(VOUCHER_STATUSES as [VoucherStatus, ...VoucherStatus[]]).optional(),
})

interface VoucherRow {
  id: string
  code: string
  status: VoucherStatus
  face_value_agorot: number
  coupon_price_agorot: number
  remaining_amount_due_agorot: number
  expires_at: string
  issued_at: string
  redeemed_at: string | null
  order_id: string
  product: { name_he: string | null } | null
  supplier: { name: string | null } | null
}

function ils(agorotValue: number | null | undefined): string {
  if (agorotValue === null || agorotValue === undefined) return '—'
  return `₪${(agorotValue / 100).toLocaleString('he-IL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export default async function AdminVouchersPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireSection('catalog')

  const raw = await props.searchParams
  const params = paramsSchema.parse(raw)
  const { from, to } = listRange(params)

  // Service role: `vouchers` RLS scopes rows to the owning customer, so a staff
  // read cannot go through the request client.
  const admin = createAdminClient()

  let query = admin
    .from('vouchers')
    .select(
      `id, code, status, face_value_agorot, coupon_price_agorot,
       remaining_amount_due_agorot, expires_at, issued_at, redeemed_at, order_id,
       product:products(name_he), supplier:suppliers(name)`,
      { count: 'exact' },
    )
    .order('issued_at', { ascending: false })
    .range(from, to)

  if (params.status) query = query.eq('status', params.status)
  if (params.q) query = query.ilike('code', `%${params.q}%`)

  const { data, count } = await query
  const rows = (data ?? []) as unknown as VoucherRow[]

  // Counts cover the whole table, not the current page, so the tiles do not
  // change meaning when the admin pages through.
  const { data: allForCounts } = await admin.from('vouchers').select('status, expires_at')
  const counts = countVouchers((allForCounts ?? []) as { status: string; expires_at: string }[])

  const urlParams = { q: params.q, status: params.status, per: params.per, page: params.page }

  const columns: ServerColumn<VoucherRow>[] = [
    {
      id: 'code',
      header: 'קוד',
      className: 'font-mono text-xs',
      cell: (v) => (
        <Link href={`/admin/coupons/codes/${v.id}`} className="text-brand hover:underline">
          <span dir="ltr">{formatVoucherCode(v.code)}</span>
        </Link>
      ),
    },
    {
      id: 'status',
      header: 'סטטוס',
      cell: (v) => (
        <div className="flex flex-col gap-1">
          <StatusBadge
            label={VOUCHER_STATUS_LABELS[v.status]}
            variant={VOUCHER_STATUS_VARIANTS[v.status]}
          />
          {isLapsedButUnswept(v) && (
            <span className="text-micro text-amber-700">פג בפועל, טרם נסרק על ידי הטאטוא</span>
          )}
        </div>
      ),
    },
    { id: 'product', header: 'מוצר', cell: (v) => v.product?.name_he ?? '—' },
    { id: 'supplier', header: 'ספק', cell: (v) => v.supplier?.name ?? '—' },
    { id: 'face', header: 'ערך מלא', cell: (v) => ils(v.face_value_agorot) },
    { id: 'paid', header: 'שולם באתר', cell: (v) => ils(v.coupon_price_agorot) },
    { id: 'collect', header: 'לגבייה בעסק', cell: (v) => ils(v.remaining_amount_due_agorot) },
    {
      id: 'redeemed',
      header: 'נסרק',
      className: 'text-xs text-black/50',
      cell: (v) => (v.redeemed_at ? new Date(v.redeemed_at).toLocaleString('he-IL') : '—'),
    },
    {
      id: 'expires',
      header: 'תוקף',
      sortKey: 'expires_at',
      className: 'whitespace-nowrap text-xs text-black/50',
      cell: (v) => new Date(v.expires_at).toLocaleDateString('he-IL'),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">שוברים מונפקים</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            סטטוס סריקה לכל שובר שהונפק, כולל QR לשחזור מול בית העסק.
          </p>
        </div>
        <Link href="/admin/coupons" className="text-sm text-brand hover:underline">
          לניהול הדילים
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatsCard label="ניתנים לסריקה" value={counts.scannable} icon={QrCode} variant="admin" />
        <StatsCard label="מומשו" value={counts.redeemed} icon={ScanLine} variant="admin" />
        <StatsCard label="פגו" value={counts.expired} icon={CalendarX} variant="admin" />
        <StatsCard label="סה״כ הונפקו" value={counts.total} icon={Ticket} variant="admin" />
      </div>

      {counts.lapsedUnswept > 0 && (
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>
            {counts.lapsedUnswept} שוברים עברו את תאריך התוקף אך עדיין רשומים כמונפקים. טאטוא התוקף
            עוד לא רץ עליהם, ולכן הם נספרים כפגים ולא כפעילים.
          </span>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {[undefined, ...VOUCHER_STATUSES].map((status) => (
          <Link
            key={status ?? 'all'}
            href={status ? `/admin/coupons/codes?status=${status}` : '/admin/coupons/codes'}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              params.status === status || (!params.status && !status)
                ? 'bg-brand text-brand-dark'
                : 'border border-gray-200 bg-white text-gray-600 hover:border-brand hover:text-brand'
            }`}
          >
            {status ? VOUCHER_STATUS_LABELS[status] : 'הכל'}
          </Link>
        ))}
      </div>

      <FilterBar
        basePath="/admin/coupons/codes"
        searchPlaceholder="חיפוש לפי קוד..."
        defaultQuery={params.q}
        preserve={{ status: params.status, per: params.per }}
      />

      <ServerDataTable
        rows={rows}
        columns={columns}
        rowKey={(v) => v.id}
        basePath="/admin/coupons/codes"
        params={urlParams}
        emptyMessage="אין שוברים"
      />

      <TablePagination
        basePath="/admin/coupons/codes"
        params={urlParams}
        page={params.page}
        perPage={params.per}
        total={count ?? 0}
      />

      <p className="text-xs text-gray-500">
        שובר שאינו במצב &quot;הונפק&quot; או שעבר את תאריך התוקף אינו ניתן לסריקה, ולכן לא מוצג
        עבורו QR.
      </p>
    </div>
  )
}
