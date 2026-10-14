import { type CategoryLink, buildEmptyStateSuggestions } from '@/lib/search/empty-state'
import type { EmptyStateVerification } from '@/lib/search/empty-state-server'
import { getPopularSearches } from '@/lib/search/popular'
import Link from 'next/link'

/**
 * The results page when the engine found nothing, or the query was too short.
 *
 * A dead end with doors (lib/search/empty-state.ts decides the promoted
 * terms and the categories; lib/search/empty-state-server.ts asks the engine
 * about the other two). The first two sentences are kept word for word from
 * the plain empty state that preceded this: e2e/home.spec.ts reads them.
 *
 * UX21, measured before (logs/ux21/before.json): a search narrowed by a
 * facet to nothing said "נסו להסיר סינון" and offered no link that did it,
 * while the chip that would was 800px further down under the grid's empty
 * box; and "אולי התכוונתם ל" was printed unverified, so it could lead to a
 * second empty page. Now a narrowed-empty search leads with one action,
 * "הצגת כל N התוצאות ללא סינון", when the bare query has results, says so
 * when it has none, and the relaxed query is offered only with its count.
 *
 * Server component: the promoted terms are one anon read, and the categories
 * are the list the page already loaded.
 */
type Props = {
  query: string
  /** The shopper narrowed with a facet, so the first hint is to widen. */
  narrowed: boolean
  /** Below the two-character floor nothing was searched at all. */
  tooShort?: boolean
  minQuery: number
  categories: CategoryLink[]
  /** The engine's answers about widening and relaxing; absent when too short. */
  verification?: EmptyStateVerification
}

export default async function SearchEmptyState({
  query,
  narrowed,
  tooShort = false,
  minQuery,
  categories,
  verification,
}: Props) {
  const popular = await getPopularSearches()
  const suggestions = buildEmptyStateSuggestions({
    query: tooShort ? '' : query,
    popular,
    categories,
  })
  const unfiltered = narrowed ? (verification?.unfiltered ?? null) : null
  const relaxed = verification?.relaxed ?? null

  return (
    <div className="category-page__empty search-empty" data-testid="search-empty-state">
      {tooShort ? (
        <p>הקלידו לפחות {minQuery} תווים כדי לחפש.</p>
      ) : (
        <>
          <p>לא נמצאו מוצרים עבור "{query}".</p>
          {narrowed && unfiltered && unfiltered.total === 0 ? (
            <p>גם ללא הסינון אין תוצאות לחיפוש הזה. נסו מילת חיפוש אחרת.</p>
          ) : (
            <p>{narrowed ? 'נסו להסיר סינון או מילת חיפוש אחרת.' : 'נסו מילת חיפוש אחרת.'}</p>
          )}
        </>
      )}

      {unfiltered && unfiltered.total > 0 ? (
        <p className="search-empty__widen">
          <Link href={unfiltered.href} className="search-empty__action" data-widen>
            הצגת כל {'⁦'}
            {unfiltered.total}
            {'⁩'} התוצאות ללא סינון
          </Link>
        </p>
      ) : null}

      {relaxed ? (
        <p className="search-empty__relaxed">
          אולי התכוונתם ל
          <Link href={relaxed.href} className="search-empty__link">
            ״{relaxed.query}״
          </Link>
          ? ({'⁦'}
          {relaxed.total}
          {'⁩'} מוצרים)
        </p>
      ) : null}

      {suggestions.terms.length > 0 ? (
        <section className="search-empty__section" aria-labelledby="search-empty-terms">
          <h2 id="search-empty-terms" className="search-empty__title">
            חיפושים פופולריים
          </h2>
          <ul className="search-empty__list">
            {suggestions.terms.map((t) => (
              <li key={t.term}>
                <Link href={t.href} className="search-empty__chip">
                  {t.term}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {suggestions.categories.length > 0 ? (
        <section className="search-empty__section" aria-labelledby="search-empty-categories">
          <h2 id="search-empty-categories" className="search-empty__title">
            או עיינו לפי קטגוריה
          </h2>
          <ul className="search-empty__list">
            {suggestions.categories.map((c) => (
              <li key={c.slug}>
                <Link href={c.href} className="search-empty__chip">
                  {c.name_he}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p>
        <Link href="/products" className="search-empty__link">
          לכל המוצרים
        </Link>
      </p>
    </div>
  )
}
