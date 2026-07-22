import FilterBar from '@/components/admin/FilterBar'
import ServerDataTable, { type ServerColumn } from '@/components/admin/ServerDataTable'
import TablePagination from '@/components/admin/TablePagination'
import { COUPON_STATUS_LABELS, labelFor } from '@/lib/admin/labels'
import { baseListParamsSchema, listRange } from '@/lib/admin/list-params'
import { requireSection } from '@/lib/admin/rbac'
import { createClient } from '@/lib/supabase/server'
import type { CouponCode, CouponStatus } from '@/types/database'
import Link from 'next/link'
import { z } from 'zod'

export const metadata = { title: 'קודי קופון' }

const COUPON_STATUSES = Object.keys(COUPON_STATUS_LABELS) as CouponStatus[]

const paramsSchema = baseListParamsSchema.extend({
  status: z.enum(COUPON_STATUSES as [CouponStatus, ...CouponStatus[]]).optional(),
})

const STATUS_COLORS: Record<CouponStatus, string> = {
  issued: 'bg-blue-100 text-blue-700',
  used: 'bg-green-100 text-green-700',
  expired: 'bg-gray-100 text-gray-600',
  refunded: 'bg-amber-100 text-amber-800',
}

export default async function AdminCouponCodesPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireSection('catalog')

  const raw = await props.searchParams
  const params = paramsSchema.parse(raw)
  const { from, to } = listRange(params)

  const supabase = await createClient()
  let query = supabase
    .from('coupon_codes')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to)

  if (params.status) query = query.eq('status', params.status)
  if (params.q) query = query.ilike('code', `%${params.q}%`)

  const { data: codes, count } = await query

  const urlParams = { q: params.q, status: params.status, per: params.per, page: params.page }

  const columns: ServerColumn<CouponCode>[] = [
    { id: 'code', header: 'קוד', className: 'font-mono text-xs', cell: (c) => c.code },
    {
      id: 'status',
      header: 'סטטוס',
      cell: (c) => (
        <span
          className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[c.status]}`}
        >
          {labelFor(COUPON_STATUS_LABELS, c.status)}
        </span>
      ),
    },
    {
      id: 'face',
      header: 'ערך מלא',
      cell: (c) => `₪${c.face_value_ils.toLocaleString('he-IL')}`,
    },
    {
      id: 'paid',
      header: 'שולם באתר',
      cell: (c) => `₪${c.platform_paid_ils.toLocaleString('he-IL')}`,
    },
    {
      id: 'collect',
      header: 'לגבייה בעסק',
      cell: (c) => `₪${c.collect_amount_ils.toLocaleString('he-IL')}`,
    },
    {
      id: 'redeemed',
      header: 'מומש',
      className: 'text-xs text-black/50',
      cell: (c) => (c.redeemed_at ? new Date(c.redeemed_at).toLocaleString('he-IL') : ''),
    },
    {
      id: 'expires',
      header: 'תוקף',
      sortKey: 'expires_at',
      className: 'whitespace-nowrap text-xs text-black/50',
      cell: (c) => new Date(c.expires_at).toLocaleDateString('he-IL'),
    },
    {
      id: 'created',
      header: 'הונפק',
      sortKey: 'created_at',
      className: 'whitespace-nowrap text-xs text-black/50',
      cell: (c) => new Date(c.created_at).toLocaleDateString('he-IL'),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-gray-900">קודי קופון מונפקים</h1>
        <Link href="/admin/coupons" className="text-sm text-brand hover:underline">
          לניהול הדילים
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        {[undefined, ...COUPON_STATUSES].map((status) => (
          <Link
            key={status ?? 'all'}
            href={status ? `/admin/coupons/codes?status=${status}` : '/admin/coupons/codes'}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              params.status === status || (!params.status && !status)
                ? 'bg-brand text-brand-dark'
                : 'border border-gray-200 bg-white text-gray-600 hover:border-brand hover:text-brand'
            }`}
          >
            {status ? COUPON_STATUS_LABELS[status] : 'הכל'}
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
        rows={codes ?? []}
        columns={columns}
        rowKey={(c) => c.id}
        basePath="/admin/coupons/codes"
        params={urlParams}
        emptyMessage="אין קודים"
      />

      <TablePagination
        basePath="/admin/coupons/codes"
        params={urlParams}
        page={params.page}
        perPage={params.per}
        total={count ?? 0}
      />
    </div>
  )
}
