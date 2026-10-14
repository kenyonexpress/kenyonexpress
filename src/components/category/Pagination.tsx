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

/** Live's `aria-label="עמוד N"` on every number (refs/ke_live_products.html). */
function pageLabel(page: number): string {
  return `עמוד ${page}`
}

/**
 * The archive's page links.
 *
 * Live's shape (UX14): a `<nav>` holding a `<ul>` of items, each number with
 * its own "עמוד N" label, the current one marked `aria-current="page"`. A
 * screen reader used to hear "1, 2, link" and nothing that said those were
 * pages; now it hears "עמוד 2, link" and "עמוד 1, current page". The links
 * themselves are the contract `Pagination.test.tsx` reads: every active filter
 * survives in every page link, and `page=1` is the bare URL.
 */
export default function Pagination({ pathname, params, currentPage, totalPages }: Props) {
  if (totalPages <= 1) return null

  const prevDisabled = currentPage <= 1
  const nextDisabled = currentPage >= totalPages

  return (
    <nav className="category-pagination" aria-label="ניווט בין עמודים">
      <ul className="category-pagination__list">
        <li>
          {prevDisabled ? (
            <span className="is-disabled" aria-hidden>
              <Chevron dir="prev" />
            </span>
          ) : (
            <Link
              href={hrefFor(pathname, params, currentPage - 1)}
              aria-label="העמוד הקודם"
              rel="prev"
            >
              <Chevron dir="prev" />
            </Link>
          )}
        </li>

        {pageWindow(currentPage, totalPages).map((p) =>
          typeof p === 'string' ? (
            <li key={p}>
              <span className="is-disabled" aria-hidden>
                …
              </span>
            </li>
          ) : p === currentPage ? (
            <li key={p}>
              <span aria-current="page" aria-label={pageLabel(p)} className="is-current">
                {p}
              </span>
            </li>
          ) : (
            <li key={p}>
              <Link href={hrefFor(pathname, params, p)} aria-label={pageLabel(p)}>
                {p}
              </Link>
            </li>
          ),
        )}

        <li>
          {nextDisabled ? (
            <span className="is-disabled" aria-hidden>
              <Chevron dir="next" />
            </span>
          ) : (
            <Link
              href={hrefFor(pathname, params, currentPage + 1)}
              aria-label="העמוד הבא"
              rel="next"
            >
              <Chevron dir="next" />
            </Link>
          )}
        </li>
      </ul>
    </nav>
  )
}
