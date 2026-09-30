import Link from 'next/link'

type Props = {
  /** Where "clear the filters" goes: the archive with no query string. */
  clearHref: string
  /**
   * Whether the shopper narrowed the archive. Decides the second line and the
   * action: a filtered-empty page offers to widen, a bare-empty page offers
   * the whole shop, because there is nothing on this page to widen back to.
   */
  hasFilters: boolean
}

/**
 * The archive with nothing to show.
 *
 * The first line is unchanged from the one the e2e suite and the shop archive
 * already look for, so the two pages keep saying the same thing. What is new
 * is that the page now tells the shopper what to do next: a filtered archive
 * offers one link that drops every facet at once, and an archive that is empty
 * on its own offers the whole catalogue instead of a dead end.
 *
 * No live region: the block streams in as the whole of a Suspense boundary,
 * so it does not exist before the change it would announce. The heading and
 * the count above it are what a screen reader lands on, and both settle first.
 */
export default function CategoryEmptyState({ clearHref, hasFilters }: Props) {
  return (
    <div className="category-page__empty">
      <p className="category-page__empty-title">לא נמצאו מוצרים התואמים את הבחירה שלך.</p>
      {hasFilters ? (
        <>
          <p className="category-page__empty-hint">נסו להסיר סינון או להרחיב את טווח המחירים.</p>
          <Link href={clearHref} className="category-page__empty-action">
            נקו את כל הסינונים
          </Link>
        </>
      ) : (
        <>
          <p className="category-page__empty-hint">
            הקטגוריה הזו מתמלאת בקרוב. בינתיים, כל המוצרים שלנו במקום אחד.
          </p>
          <Link href="/products" className="category-page__empty-action">
            לכל המוצרים
          </Link>
        </>
      )}
    </div>
  )
}
