'use client'

import DataTable, { type DataTableColumn } from '@/components/admin/DataTable'
import DeleteButton from '@/components/admin/DeleteButton'
import StatusBadge, { productStatusBadge } from '@/components/admin/StatusBadge'
import { shekelsFromIls, shekelsFromIlsRounded } from '@/lib/money-format'
import { softDeleteCouponDeal } from '@/server/actions/admin/coupon-deals'
import Link from 'next/link'

export type CouponRow = {
  id: string
  title_he: string
  business_name: string
  original_price: number
  platform_price: number | null
  status: string
  valid_until: string | null
}

interface Props {
  deals: CouponRow[]
}

export default function CouponsTable({ deals }: Props) {
  const columns: DataTableColumn<CouponRow>[] = [
    {
      id: 'title',
      header: 'כותרת',
      sortable: true,
      accessor: (d) => d.title_he,
      cell: (d) => (
        <Link
          href={`/admin/coupons?edit=${d.id}`}
          className="font-medium text-black underline-offset-2 hover:underline"
        >
          {d.title_he}
        </Link>
      ),
    },
    {
      id: 'business',
      header: 'עסק',
      sortable: true,
      accessor: (d) => d.business_name,
      cell: (d) => <span className="text-black/70">{d.business_name}</span>,
    },
    {
      id: 'original',
      header: 'מחיר מקורי',
      sortable: true,
      accessor: (d) => d.original_price,
      cell: (d) => <span>{shekelsFromIlsRounded(d.original_price)}</span>,
    },
    {
      id: 'platform',
      header: 'מחיר פלטפורמה',
      sortable: true,
      // No fallback: platform_price has no default. Showing 10% of the sticker
      // for an unpriced deal told the admin a number the checkout would not
      // charge, and hid the fact that the deal is not sellable yet.
      accessor: (d) => d.platform_price ?? -1,
      cell: (d) =>
        d.platform_price != null ? (
          <span className="font-semibold">{shekelsFromIls(d.platform_price)}</span>
        ) : (
          <span className="text-xs text-gray-400">לא הוגדר</span>
        ),
    },
    {
      id: 'valid_until',
      header: 'תוקף עד',
      sortable: true,
      accessor: (d) => d.valid_until ?? '',
      cell: (d) => (
        <span className="text-xs text-black/50">
          {d.valid_until ? new Date(d.valid_until).toLocaleDateString('he-IL') : 'ללא הגבלה'}
        </span>
      ),
    },
    {
      id: 'status',
      header: 'סטטוס',
      sortable: true,
      accessor: (d) => d.status,
      cell: (d) => {
        const badge = productStatusBadge(d.status as 'draft' | 'active' | 'paused' | 'archived')
        return <StatusBadge label={badge.label} variant={badge.variant} />
      },
    },
    {
      id: 'actions',
      header: 'פעולות',
      className: 'w-36',
      cell: (d) => (
        <div className="flex items-center gap-3">
          <Link
            href={`/admin/coupons?edit=${d.id}`}
            className="text-sm text-black underline-offset-2 hover:underline"
          >
            עריכה
          </Link>
          <DeleteButton onConfirm={() => softDeleteCouponDeal(d.id)} />
        </div>
      ),
    },
  ]

  return (
    <DataTable
      data={deals}
      columns={columns}
      rowKey={(d) => d.id}
      searchKeys={[(d) => d.title_he, (d) => d.business_name]}
      searchPlaceholder="חיפוש קופונים..."
      emptyMessage="אין קופונים"
    />
  )
}
