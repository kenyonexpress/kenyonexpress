import { ChevronLeft, ChevronRight } from 'lucide-react'
import Link from 'next/link'

type Props = {
  pathname: string
  /** Current query params (sort, etc.) to preserve across page links. */
  params: Record<string, string | undefined>
  currentPage: number
  totalPages: number
}

function hrefFor(pathname: string, params: Record<string, string | undefined>, page: number) {
  const sp = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value) sp.set(key, value)
  }
  if (page > 1) sp.set('page', String(page))
  else sp.delete('page')
  const qs = sp.toString()
  return qs ? `${pathname}?${qs}` : pathname
}

/** Compact page-window: first, last, current +/- 1, with gaps (keyed by the page they follow). */
function pageWindow(current: number, total: number): (number | `gap-${number}`)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages = new Set([1, total, current, current - 1, current + 1])
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b)
  const out: (number | `gap-${number}`)[] = []
  let prev = 0
  for (const p of sorted) {
    if (p - prev > 1) out.push(`gap-${prev}`)
    out.push(p)
    prev = p
  }
  return out
}

const baseLink =
  'inline-flex h-9 min-w-9 items-center justify-center rounded-lg border px-2 text-sm transition-colors'

export default function Pagination({ pathname, params, currentPage, totalPages }: Props) {
  if (totalPages <= 1) return null

  const prevDisabled = currentPage <= 1
  const nextDisabled = currentPage >= totalPages

  return (
    <nav className="flex items-center justify-center gap-1.5" aria-label="ניווט בין עמודים">
      {/* In RTL "previous" sits on the end side; chevrons mirror automatically */}
      {prevDisabled ? (
        <span
          className={`${baseLink} cursor-not-allowed border-gray-100 text-gray-300`}
          aria-hidden
        >
          <ChevronRight className="rtl:scale-x-[-1]" size={18} />
        </span>
      ) : (
        <Link
          href={hrefFor(pathname, params, currentPage - 1)}
          className={`${baseLink} border-gray-200 text-gray-700 hover:border-brand-primary`}
          aria-label="העמוד הקודם"
          rel="prev"
        >
          <ChevronRight className="rtl:scale-x-[-1]" size={18} />
        </Link>
      )}

      {pageWindow(currentPage, totalPages).map((p) =>
        typeof p === 'string' ? (
          <span key={p} className="px-1 text-gray-400" aria-hidden>
            …
          </span>
        ) : p === currentPage ? (
          <span
            key={p}
            aria-current="page"
            className={`${baseLink} border-brand-primary bg-brand-primary font-semibold text-gray-900`}
          >
            {p}
          </span>
        ) : (
          <Link
            key={p}
            href={hrefFor(pathname, params, p)}
            className={`${baseLink} border-gray-200 text-gray-700 hover:border-brand-primary`}
          >
            {p}
          </Link>
        ),
      )}

      {nextDisabled ? (
        <span
          className={`${baseLink} cursor-not-allowed border-gray-100 text-gray-300`}
          aria-hidden
        >
          <ChevronLeft className="rtl:scale-x-[-1]" size={18} />
        </span>
      ) : (
        <Link
          href={hrefFor(pathname, params, currentPage + 1)}
          className={`${baseLink} border-gray-200 text-gray-700 hover:border-brand-primary`}
          aria-label="העמוד הבא"
          rel="next"
        >
          <ChevronLeft className="rtl:scale-x-[-1]" size={18} />
        </Link>
      )}
    </nav>
  )
}
