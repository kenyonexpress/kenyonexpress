'use client'

import DataTable, { type DataTableColumn } from '@/components/admin/DataTable'
import DeleteButton from '@/components/admin/DeleteButton'
import StatusBadge, { productStatusBadge } from '@/components/admin/StatusBadge'
import {
  type BulkPriceInput,
  bulkAdjustPrices,
  bulkAssignCategory,
  bulkSoftDeleteProducts,
  bulkUpdateProductStatus,
  deleteProduct,
} from '@/server/actions/admin/products'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'

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
  categories: { id: string; name_he: string }[]
}

const bulkBtn =
  'rounded-lg px-3 py-1.5 text-xs font-medium border border-black/10 transition-colors disabled:opacity-50'

export default function ProductsTable({ products, categories }: Props) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [bulkCategory, setBulkCategory] = useState('')
  const [priceMode, setPriceMode] = useState<'percent' | 'set'>('percent')
  const [priceValue, setPriceValue] = useState('')

  const allSelected = products.length > 0 && products.every((p) => selected.has(p.id))

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(products.map((p) => p.id)))
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function runBulk(fn: () => Promise<{ error?: string } | undefined>, successMsg: string) {
    setBusy(true)
    try {
      const result = await fn()
      if (result && 'error' in result && result.error) {
        toast.error(result.error)
        return
      }
      toast.success(successMsg)
      setSelected(new Set())
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  const ids = Array.from(selected)

  async function applyPrices() {
    const value = Number(priceValue)
    if (!priceValue || Number.isNaN(value)) {
      toast.error('הזינו ערך מספרי')
      return
    }
    setBusy(true)
    try {
      const input: BulkPriceInput =
        priceMode === 'percent' ? { mode: 'percent', value } : { mode: 'set', value }
      const result = await bulkAdjustPrices(ids, input)
      if (result.error) {
        toast.error(result.error)
        return
      }
      if (result.skipped?.length) {
        toast.warning(
          `${result.updated} עודכנו; ${result.skipped.length} דולגו (מחיר מלא נמוך מהמחיר החדש): ${result.skipped.join(', ')}`,
        )
      } else {
        toast.success(`מחירי ${result.updated} מוצרים עודכנו`)
      }
      setSelected(new Set())
      setPriceValue('')
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  const columns: DataTableColumn<ProductRow>[] = [
    {
      id: 'select',
      header: '',
      className: 'w-10',
      cell: (p) => (
        <input
          type="checkbox"
          checked={selected.has(p.id)}
          onChange={() => toggleOne(p.id)}
          aria-label={`בחירת ${p.name_he}`}
          className="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand"
        />
      ),
    },
    {
      id: 'name',
      header: 'שם',
      sortable: true,
      accessor: (p) => p.name_he,
      cell: (p) => (
        <div>
          <Link
            href={`/admin/products/${p.id}/edit`}
            className="font-medium text-black underline-offset-2 hover:underline"
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
            className="text-sm text-black underline-offset-2 hover:underline"
          >
            עריכה
          </Link>
          <DeleteButton onConfirm={() => deleteProduct(p.id)} />
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-xs text-black/60">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            aria-label="בחירת כל המוצרים בעמוד"
            className="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand"
          />
          בחירת הכל בעמוד
        </label>
        {selected.size > 0 && (
          <span className="text-xs font-semibold text-black/70">{selected.size} נבחרו</span>
        )}
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-black/10 bg-[#fffbe6] px-3 py-2">
          {/* Publish / hide / archive */}
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void runBulk(() => bulkUpdateProductStatus(ids, 'active'), 'המוצרים פורסמו')
            }
            className={`${bulkBtn} bg-green-100 text-green-800 hover:bg-green-200`}
          >
            פרסום
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void runBulk(() => bulkUpdateProductStatus(ids, 'paused'), 'המוצרים הוסתרו')
            }
            className={`${bulkBtn} bg-yellow-100 text-yellow-800 hover:bg-yellow-200`}
          >
            הסתרה
          </button>

          {/* Category assignment */}
          <span className="mx-1 h-5 w-px bg-black/10" aria-hidden />
          <select
            value={bulkCategory}
            onChange={(e) => setBulkCategory(e.target.value)}
            aria-label="בחירת קטגוריה לשיוך"
            className="rounded-lg border border-black/10 bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand"
          >
            <option value="">בחרו קטגוריה...</option>
            <option value="__none__">ללא קטגוריה</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name_he}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy || !bulkCategory}
            onClick={() =>
              void runBulk(
                () => bulkAssignCategory(ids, bulkCategory === '__none__' ? null : bulkCategory),
                'הקטגוריה עודכנה',
              )
            }
            className={`${bulkBtn} bg-blue-100 text-blue-800 hover:bg-blue-200`}
          >
            שיוך קטגוריה
          </button>

          {/* Price adjustment */}
          <span className="mx-1 h-5 w-px bg-black/10" aria-hidden />
          <select
            value={priceMode}
            onChange={(e) => setPriceMode(e.target.value as 'percent' | 'set')}
            aria-label="סוג עדכון מחיר"
            className="rounded-lg border border-black/10 bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand"
          >
            <option value="percent">שינוי באחוזים</option>
            <option value="set">קביעת מחיר (₪)</option>
          </select>
          <input
            type="number"
            step="0.01"
            value={priceValue}
            onChange={(e) => setPriceValue(e.target.value)}
            placeholder={priceMode === 'percent' ? 'למשל: -10' : 'למשל: 99.90'}
            aria-label="ערך עדכון מחיר"
            dir="ltr"
            className="w-28 rounded-lg border border-black/10 bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand"
          />
          <button
            type="button"
            disabled={busy || !priceValue}
            onClick={() => void applyPrices()}
            className={`${bulkBtn} bg-purple-100 text-purple-800 hover:bg-purple-200`}
          >
            עדכון מחירים
          </button>

          {/* Soft delete */}
          <span className="mx-1 h-5 w-px bg-black/10" aria-hidden />
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (window.confirm(`למחוק ${selected.size} מוצרים? (מחיקה רכה, ניתן לשחזר ב-DB)`)) {
                void runBulk(() => bulkSoftDeleteProducts(ids), 'המוצרים נמחקו')
              }
            }}
            className={`${bulkBtn} bg-red-100 text-red-700 hover:bg-red-200`}
          >
            מחיקה
          </button>
        </div>
      )}

      <DataTable
        data={products}
        columns={columns}
        rowKey={(p) => p.id}
        searchKeys={[(p) => p.name_he, (p) => p.slug, (p) => p.category_name ?? '']}
        searchPlaceholder="חיפוש מוצרים..."
        emptyMessage="אין מוצרים"
      />
    </div>
  )
}
