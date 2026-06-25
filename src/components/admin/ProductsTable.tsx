'use client'

import DataTable, { type DataTableColumn } from '@/components/admin/DataTable'
import DeleteButton from '@/components/admin/DeleteButton'
import StatusBadge, { productStatusBadge } from '@/components/admin/StatusBadge'
import { deleteProduct } from '@/server/actions/admin/products'
import Link from 'next/link'

export type ProductRow = {
  id: string
  name_he: string
  slug: string
  status: string
  kenyon_price: number | null
  type: string
  is_featured: boolean | null
  category_name: string | null
}

interface Props {
  products: ProductRow[]
}

export default function ProductsTable({ products }: Props) {
  const columns: DataTableColumn<ProductRow>[] = [
    {
      id: 'name',
      header: 'שם',
      sortable: true,
      accessor: (p) => p.name_he,
      cell: (p) => (
        <div>
          <Link
            href={`/admin/products/${p.id}/edit`}
            className="font-medium text-[#000000] underline-offset-2 hover:underline"
          >
            {p.name_he}
            {p.is_featured && <span className="ms-1 text-xs text-amber-500">★</span>}
          </Link>
          <div className="font-mono text-xs text-black/40">{p.slug}</div>
        </div>
      ),
    },
    {
      id: 'category',
      header: 'קטגוריה',
      sortable: true,
      accessor: (p) => p.category_name ?? '',
      cell: (p) => <span className="text-black/70">{p.category_name ?? '—'}</span>,
    },
    {
      id: 'price',
      header: 'מחיר',
      sortable: true,
      accessor: (p) => p.kenyon_price ?? 0,
      cell: (p) => (
        <span className="text-black/80">₪{(p.kenyon_price ?? 0).toLocaleString('he-IL')}</span>
      ),
    },
    {
      id: 'type',
      header: 'סוג',
      cell: (p) => (
        <StatusBadge
          label={p.type === 'physical' ? 'פיזי' : 'קופון'}
          variant={p.type === 'physical' ? 'blue' : 'yellow'}
        />
      ),
    },
    {
      id: 'status',
      header: 'סטטוס',
      sortable: true,
      accessor: (p) => p.status,
      cell: (p) => {
        const badge = productStatusBadge(p.status)
        return <StatusBadge label={badge.label} variant={badge.variant} />
      },
    },
    {
      id: 'actions',
      header: 'פעולות',
      className: 'w-36',
      cell: (p) => (
        <div className="flex items-center gap-3">
          <Link
            href={`/admin/products/${p.id}/edit`}
            className="text-sm text-[#000000] underline-offset-2 hover:underline"
          >
            עריכה
          </Link>
          <DeleteButton onConfirm={() => deleteProduct(p.id)} />
        </div>
      ),
    },
  ]

  return (
    <DataTable
      data={products}
      columns={columns}
      rowKey={(p) => p.id}
      searchKeys={[(p) => p.name_he, (p) => p.slug, (p) => p.category_name ?? '']}
      searchPlaceholder="חיפוש מוצרים..."
      emptyMessage="אין מוצרים"
    />
  )
}
