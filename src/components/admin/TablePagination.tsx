import { buildListQuery } from '@/lib/admin/list-params'
import { cn } from '@/lib/utils'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import Link from 'next/link'

interface TablePaginationProps {
  basePath: string
  params?: Record<string, string | number | undefined>
  page: number
  perPage: number
  total: number
}

// Link-based pagination (no client JS). RTL: "next" moves to the start side,
// so the chevrons are mirrored with the rtl: variant.
export default function TablePagination({
  basePath,
  params = {},
  page,
  perPage,
  total,
}: TablePaginationProps) {
  const pageCount = Math.max(1, Math.ceil(total / perPage))
  if (pageCount <= 1) return null

  const clamp = (p: number) => Math.min(Math.max(1, p), pageCount)
  const href = (p: number) => `${basePath}${buildListQuery(params, { page: clamp(p) })}`

  const from = (page - 1) * perPage + 1
  const to = Math.min(page * perPage, total)

  return (
    <nav aria-label="ניווט עמודים" className="flex items-center justify-between gap-4 text-sm">
      <span className="text-black/50">
        {from.toLocaleString('he-IL')}-{to.toLocaleString('he-IL')} מתוך{' '}
        {total.toLocaleString('he-IL')}
      </span>
      <div className="flex items-center gap-1">
        <PageLink href={href(page - 1)} disabled={page <= 1} label="הקודם">
          <ChevronRight size={15} className="rtl:scale-x-[-1]" />
        </PageLink>
        {pageNumbers(page, pageCount).map((p, idx) =>
          p === null ? (
            // biome-ignore lint/suspicious/noArrayIndexKey: gaps are positional
            <span key={`gap-${idx}`} className="px-1 text-black/30">
              …
            </span>
          ) : (
            <Link
              key={p}
              href={href(p)}
              aria-current={p === page ? 'page' : undefined}
              className={cn(
                'min-w-8 rounded-lg px-2 py-1.5 text-center transition-colors',
                p === page
                  ? 'bg-brand-primary font-bold text-heading'
                  : 'text-black/60 hover:bg-black/[0.04]',
              )}
            >
              {p.toLocaleString('he-IL')}
            </Link>
          ),
        )}
        <PageLink href={href(page + 1)} disabled={page >= pageCount} label="הבא">
          <ChevronLeft size={15} className="rtl:scale-x-[-1]" />
        </PageLink>
      </div>
    </nav>
  )
}

function PageLink({
  href,
  disabled,
  label,
  children,
}: {
  href: string
  disabled: boolean
  label: string
  children: React.ReactNode
}) {
  if (disabled) {
    return (
      <span className="rounded-lg p-1.5 text-black/20" aria-hidden>
        {children}
      </span>
    )
  }
  return (
    <Link
      href={href}
      aria-label={label}
      className="rounded-lg p-1.5 text-black/60 transition-colors hover:bg-black/[0.04]"
    >
      {children}
    </Link>
  )
}

// 1 … (p-1) p (p+1) … last
function pageNumbers(page: number, pageCount: number): (number | null)[] {
  const pages = new Set<number>([1, pageCount, page - 1, page, page + 1])
  const sorted = [...pages].filter((p) => p >= 1 && p <= pageCount).sort((a, b) => a - b)
  const result: (number | null)[] = []
  let prev = 0
  for (const p of sorted) {
    if (p - prev > 1) result.push(null)
    result.push(p)
    prev = p
  }
  return result
}
