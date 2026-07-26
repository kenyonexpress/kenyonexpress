import { buildListQuery } from '@/lib/admin/list-params'
import { cn } from '@/lib/utils'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import Link from 'next/link'

// RSC-first data table: pagination, sorting and filtering are URL state
// resolved by the page's server query; this component only renders.
// Bulk actions: wrap the table in a <form action={serverAction}> and set
// selectable - each row then carries a checkbox named "ids".

export type ServerColumn<T> = {
  id: string
  header: string
  cell: (row: T) => React.ReactNode
  className?: string
  // When present, the header becomes a link that toggles sort/dir in the URL.
  sortKey?: string
}

interface ServerDataTableProps<T> {
  rows: T[]
  columns: ServerColumn<T>[]
  rowKey: (row: T) => string
  basePath: string
  // Current (already-validated) list params, echoed into sort/page links.
  params?: Record<string, string | number | undefined>
  emptyMessage?: string
  selectable?: boolean
}

export default function ServerDataTable<T>({
  rows,
  columns,
  rowKey,
  basePath,
  params = {},
  emptyMessage = 'אין נתונים',
  selectable = false,
}: ServerDataTableProps<T>) {
  const currentSort = params.sort as string | undefined
  const currentDir = (params.dir as string | undefined) ?? 'desc'

  return (
    <div className="overflow-x-auto rounded-xl border border-black/10 bg-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-black/10 bg-black/[0.02] text-end text-xs text-black/50">
            {selectable && <th className="w-10 px-3 py-3" />}
            {columns.map((col) => (
              <th key={col.id} className={cn('px-4 py-3 font-medium', col.className)}>
                {col.sortKey ? (
                  <Link
                    href={`${basePath}${buildListQuery(params, {
                      sort: col.sortKey,
                      dir: currentSort === col.sortKey && currentDir === 'desc' ? 'asc' : 'desc',
                      page: 1,
                    })}`}
                    className="inline-flex items-center gap-1 transition-colors hover:text-ink"
                  >
                    {col.header}
                    {currentSort === col.sortKey ? (
                      currentDir === 'asc' ? (
                        <ArrowUp size={12} />
                      ) : (
                        <ArrowDown size={12} />
                      )
                    ) : (
                      <ArrowUpDown size={12} className="opacity-40" />
                    )}
                  </Link>
                ) : (
                  col.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-black/5">
          {rows.map((row) => (
            <tr key={rowKey(row)} className="text-ink transition-colors hover:bg-brand-primary/20">
              {selectable && (
                <td className="w-10 px-3 py-3">
                  <input
                    type="checkbox"
                    name="ids"
                    value={rowKey(row)}
                    className="size-4 accent-brand-primary"
                    aria-label="בחירת שורה"
                  />
                </td>
              )}
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
                colSpan={columns.length + (selectable ? 1 : 0)}
                className="px-4 py-10 text-center text-sm text-black/40"
              >
                {emptyMessage}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
