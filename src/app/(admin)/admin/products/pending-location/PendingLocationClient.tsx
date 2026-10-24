'use client'

import { CITIES } from '@/lib/geo/cities'
import { setBatchProductLocation } from '@/server/actions/admin/product-location'
import Link from 'next/link'
import { useState, useTransition } from 'react'

interface Product {
  id: string
  name_he: string
  slug: string
  status: string
  full_address: string | null
}

interface Props {
  products: Product[]
}

export function PendingLocationClient({ products }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [batchCity, setBatchCity] = useState('')
  const [batchAddress, setBatchAddress] = useState('')
  const [isPending, startTransition] = useTransition()

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelected(new Set(products.map((p) => p.id)))
    } else {
      setSelected(new Set())
    }
  }

  const handleSelectOne = (id: string, checked: boolean) => {
    const newSelected = new Set(selected)
    if (checked) {
      newSelected.add(id)
    } else {
      newSelected.delete(id)
    }
    setSelected(newSelected)
  }

  const handleBatchSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      await setBatchProductLocation(formData)
    })
  }

  const allSelected = products.length > 0 && selected.size === products.length
  const someSelected = selected.size > 0 && selected.size < products.length

  return (
    <div dir="rtl" className="space-y-6">
      {selected.size > 0 && (
        <div className="rounded-xl border border-brand-primary bg-brand-primary/5 p-4">
          <h2 className="mb-3 text-lg font-bold text-heading">עדכון קבוצתי</h2>
          <p className="mb-4 text-sm text-muted">
            נבחרו {selected.size} מוצרים. הזינו עיר (וכתובת אם רוצים) לעדכן את כולם בבת אחת.
          </p>
          <form onSubmit={handleBatchSubmit} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="ids" value={Array.from(selected).join(',')} />
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted">עיר</span>
              <input
                name="city"
                list="known-cities"
                required
                minLength={2}
                maxLength={60}
                value={batchCity}
                onChange={(e) => setBatchCity(e.target.value)}
                className="rounded-md border border-border px-3 py-2"
                placeholder="בחרו עיר"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted">כתובת (לא חובה)</span>
              <input
                name="full_address"
                maxLength={200}
                value={batchAddress}
                onChange={(e) => setBatchAddress(e.target.value)}
                className="rounded-md border border-border px-3 py-2"
                placeholder="כתובת מלאה"
              />
            </label>
            <button
              type="submit"
              disabled={isPending}
              className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-bold text-brand-dark hover:bg-brand-primary-hover disabled:opacity-50"
            >
              {isPending ? 'שומר...' : `עדכן ${selected.size} מוצרים`}
            </button>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-surface-hover"
            >
              בטל בחירה
            </button>
          </form>
        </div>
      )}

      <datalist id="known-cities">
        {CITIES.map((c) => (
          <option key={c.slug} value={c.name} />
        ))}
      </datalist>

      {products.length === 0 ? (
        <p className="text-sm text-muted">אין מוצרים שממתינים למיקום.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-white">
          <table className="w-full text-sm">
            <caption className="sr-only">מוצרים שממתינים לעיר</caption>
            <thead className="bg-surface-hover text-start">
              <tr>
                <th scope="col" className="p-3 text-start">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(input) => {
                      if (input) input.indeterminate = someSelected
                    }}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    className="cursor-pointer"
                    aria-label="בחר הכל"
                  />
                </th>
                <th scope="col" className="p-3 text-start">
                  מוצר
                </th>
                <th scope="col" className="p-3 text-start">
                  סטטוס
                </th>
                <th scope="col" className="p-3 text-start">
                  פעולות
                </th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-t border-border align-top">
                  <td className="p-3">
                    <input
                      type="checkbox"
                      checked={selected.has(p.id)}
                      onChange={(e) => handleSelectOne(p.id, e.target.checked)}
                      className="cursor-pointer"
                      aria-label={`בחר ${p.name_he}`}
                    />
                  </td>
                  <td className="p-3">
                    <Link href={`/admin/products/${p.id}`} className="text-link hover:underline">
                      {p.name_he}
                    </Link>
                  </td>
                  <td className="p-3 text-muted">{p.status}</td>
                  <td className="p-3">
                    <Link
                      href={`/admin/products/${p.id}/edit`}
                      className="text-sm text-link hover:underline"
                    >
                      ערוך מוצר
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
