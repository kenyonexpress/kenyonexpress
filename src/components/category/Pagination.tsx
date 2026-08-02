import Link from 'next/link'

type Props = {
  pathname: string
  /** Current query params (sort, min, max...) to preserve across page links. */
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

function Chevron({ dir }: { dir: 'prev' | 'next' }) {
  // RTL: "prev" points to the inline-start (right), "next" to the inline-end (left)
  return (
    <svg
      viewBox="0 0 8 12"
      width={8}
      height={12}
      fill="currentColor"
      aria-hidden="true"
      className={dir === 'prev' ? 'rtl:scale-x-[-1]' : undefined}
    >
      <path d="M5.9 0 0 6l5.9 6L8 9.9 4.2 6 8 2.1z" />
    </svg>
  )
}

export default function Pagination({ pathname, params, currentPage, totalPages }: Props) {
  if (totalPages <= 1) return null

  const prevDisabled = currentPage <= 1
  const nextDisabled = currentPage >= totalPages

  return (
    <nav className="category-pagination" aria-label="ניווט בין עמודים">
      {prevDisabled ? (
        <span className="is-disabled" aria-hidden>
          <Chevron dir="prev" />
        </span>
      ) : (
        <Link href={hrefFor(pathname, params, currentPage - 1)} aria-label="העמוד הקודם" rel="prev">
          <Chevron dir="prev" />
        </Link>
      )}

      {pageWindow(currentPage, totalPages).map((p) =>
        typeof p === 'string' ? (
          <span key={p} className="is-disabled" aria-hidden>
            …
          </span>
        ) : p === currentPage ? (
          <span key={p} aria-current="page" className="is-current">
            {p}
          </span>
        ) : (
          <Link key={p} href={hrefFor(pathname, params, p)}>
            {p}
          </Link>
        ),
      )}

      {nextDisabled ? (
        <span className="is-disabled" aria-hidden>
          <Chevron dir="next" />
        </span>
      ) : (
        <Link href={hrefFor(pathname, params, currentPage + 1)} aria-label="העמוד הבא" rel="next">
          <Chevron dir="next" />
        </Link>
      )}
    </nav>
  )
}
