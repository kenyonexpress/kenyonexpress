'use client'

import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from 'lucide-react'
import { useMemo, useState } from 'react'

export type DataTableColumn<T> = {
  id: string
  header: string
  sortable?: boolean
  accessor?: (row: T) => string | number | null | undefined
  cell: (row: T) => React.ReactNode
  className?: string
}

type SortDir = 'asc' | 'desc'

interface DataTableProps<T> {
  data: T[]
  columns: DataTableColumn<T>[]
  rowKey: (row: T) => string
  searchKeys?: ((row: T) => string)[]
  searchPlaceholder?: string
  emptyMessage?: string
  toolbar?: React.ReactNode
}

export default function DataTable<T>({
  data,
  columns,
  rowKey,
  searchKeys,
  searchPlaceholder = 'חיפוש...',
  emptyMessage = 'אין נתונים',
  toolbar,
}: DataTableProps<T>) {
  const [query, setQuery] = useState('')
  const [sortCol, setSortCol] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  function toggleSort(colId: string) {
    if (sortCol === colId) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortCol(colId)
      setSortDir('asc')
    }
  }

  const rows = useMemo(() => {
    let result = data

    if (query.trim() && searchKeys?.length) {
      const q = query.trim().toLowerCase()
      result = result.filter((row) => searchKeys.some((fn) => fn(row).toLowerCase().includes(q)))
    }

    if (sortCol) {
      const col = columns.find((c) => c.id === sortCol)
      if (col?.accessor) {
        result = [...result].sort((a, b) => {
          const av = col.accessor!(a)
          const bv = col.accessor!(b)
          if (av == null && bv == null) return 0
          if (av == null) return 1
          if (bv == null) return -1
          const cmp =
            typeof av === 'number' && typeof bv === 'number'
              ? av - bv
              : String(av).localeCompare(String(bv), 'he')
          return sortDir === 'asc' ? cmp : -cmp
        })
      }
    }

    return result
  }, [data, query, sortCol, sortDir, columns, searchKeys])

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        {searchKeys && searchKeys.length > 0 && (
          <div className="relative min-w-[12rem] flex-1 max-w-sm">
            <Search
              size={15}
              className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-black/40"
              aria-hidden
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="border-black/10 bg-white ps-9 text-black focus-visible:ring-brand-primary"
            />
          </div>
        )}
        {toolbar}
      </div>

      <div className="overflow-hidden rounded-xl border border-black/10 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-black/10 bg-black/[0.02] text-end text-xs text-black/50">
              {columns.map((col) => (
                <th key={col.id} className={cn('px-4 py-3 font-medium', col.className)}>
                  {col.sortable && col.accessor ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(col.id)}
                      className="inline-flex items-center gap-1 transition-colors hover:text-black"
                    >
                      {col.header}
                      {sortCol === col.id ? (
                        sortDir === 'asc' ? (
                          <ArrowUp size={12} />
                        ) : (
                          <ArrowDown size={12} />
                        )
                      ) : (
                        <ArrowUpDown size={12} className="opacity-40" />
                      )}
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                className="text-black transition-colors hover:bg-brand-primary/20"
              >
                {columns.map((col) => (
                  <td key={col.id} className={cn('px-4 py-3', col.className)}>
                    {col.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-10 text-center text-sm text-black/40"
                >
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
