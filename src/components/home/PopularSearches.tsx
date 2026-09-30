import { getHomePopularSearches } from '@/lib/homepage/below-fold'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

/**
 * The promoted search terms as a row of chips, under the category tiles
 * (STEP 08, 30.09). The same list the results page's empty state and the
 * search box's dropdown already show, curated by an operator in
 * /admin/search; until this section the home page, the one page most
 * visitors land on, never offered it.
 *
 * Below the 2600px the parity gate scores, like every section after the
 * deals grid (see `lib/homepage/below-fold-rules.ts`); the read is
 * `'use cache'` so the page stays static. Renders nothing when the operator
 * has promoted nothing, rather than an empty heading.
 */
export default async function PopularSearches() {
  const chips = await getHomePopularSearches()
  if (chips.length === 0) return null

  return (
    <section
      aria-labelledby="popular-searches-title"
      dir="rtl"
      data-testid="popular-searches"
      className="mx-auto w-full max-w-deals px-deals-pad pb-10 font-sans md:px-deals-pad-md xl:px-0"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 id="popular-searches-title" className="m-0 text-section-title font-bold text-heading">
          חיפושים פופולריים
        </h2>
        <Link
          href="/search"
          className="flex min-h-11 items-center gap-1 whitespace-nowrap text-sm text-heading transition-opacity hover:opacity-70"
        >
          לחיפוש
          <ArrowLeft size={16} aria-hidden="true" />
        </Link>
      </div>
      <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
        {chips.map((chip) => (
          <li key={chip.term}>
            <Link
              href={chip.href}
              className="inline-flex min-h-11 items-center rounded-full border border-border-alt bg-surface px-4 text-sm text-heading transition-colors hover:border-brand-primary hover:bg-brand-primary focus-visible:border-brand-primary focus-visible:bg-brand-primary"
            >
              {chip.term}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
