import Link from 'next/link'

/**
 * The breadcrumb the content pages already use, with a second level for the
 * pages under `/about`.
 *
 * Copied in shape from `/faq` and `/about`, deliberately: the comment on
 * `about/page.tsx` explains that a new marketing page with its own rhythm is
 * exactly what the comparison gate exists to catch. One trail markup here
 * rather than three near-copies in three pages.
 */
export default function AboutBreadcrumb({ current }: { current?: string }) {
  return (
    <nav aria-label="נתיב ניווט" className="mb-6 text-sm text-heading/80">
      <Link href="/" className="hover:text-heading">
        בית
      </Link>
      <span aria-hidden="true" className="mx-2">
        /
      </span>
      {current ? (
        <>
          <Link href="/about" className="hover:text-heading">
            אודות
          </Link>
          <span aria-hidden="true" className="mx-2">
            /
          </span>
          <span className="text-heading">{current}</span>
        </>
      ) : (
        <span className="text-heading">אודות</span>
      )}
    </nav>
  )
}
