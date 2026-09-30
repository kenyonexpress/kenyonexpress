import { type CategoryLink, buildEmptyStateSuggestions } from '@/lib/search/empty-state'
import { getPopularSearches } from '@/lib/search/popular'
import Link from 'next/link'

/**
 * The results page when the engine found nothing, or the query was too short.
 *
 * A dead end with three doors (lib/search/empty-state.ts decides which):
 * a relaxed query, the operator's promoted terms, and the categories. The
 * first two sentences are kept word for word from the plain empty state that
 * preceded this: e2e/home.spec.ts reads them.
 *
 * Server component: the promoted terms are one anon read, and the categories
 * are the list the page already loaded for its sidebar.
 */
type Props = {
  query: string
  /** The shopper narrowed with a facet, so the first hint is to widen. */
  narrowed: boolean
  /** Below the two-character floor nothing was searched at all. */
  tooShort?: boolean
  minQuery: number
  categories: CategoryLink[]
}

export default async function SearchEmptyState({
  query,
  narrowed,
  tooShort = false,
  minQuery,
  categories,
}: Props) {
  const popular = await getPopularSearches()
  const suggestions = buildEmptyStateSuggestions({
    query: tooShort ? '' : query,
    popular,
    categories,
  })

  return (
    <div className="category-page__empty search-empty" data-testid="search-empty-state">
      {tooShort ? (
        <p>הקלידו לפחות {minQuery} תווים כדי לחפש.</p>
      ) : (
        <>
          <p>לא נמצאו מוצרים עבור "{query}".</p>
          <p>{narrowed ? 'נסו להסיר סינון או מילת חיפוש אחרת.' : 'נסו מילת חיפוש אחרת.'}</p>
        </>
      )}

      {suggestions.relaxed ? (
        <p className="search-empty__relaxed">
          אולי התכוונתם ל
          <Link
            href={`/search?q=${encodeURIComponent(suggestions.relaxed)}`}
            className="search-empty__link"
          >
            ״{suggestions.relaxed}״
          </Link>
          ?
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
