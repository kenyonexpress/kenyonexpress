'use client'

import { useCompareList } from '@/components/compare/useCompareList'
import Link from 'next/link'

/**
 * The way from a listing to the comparison table: how many products are
 * picked, a link to the table, and a way to start over.
 *
 * Renders nothing until something is picked, so a listing nobody has touched
 * is exactly the page it was. It appears in response to a press, in the flow
 * above the grid rather than fixed to the screen: the storefront already has
 * a fixed tab bar and a floating contact button on a phone, and a third thing
 * pinned to the bottom edge would sit on one of them.
 */
export default function CompareBar() {
  const { list, clear } = useCompareList()
  if (list.length === 0) return null

  return (
    <div className="category-compare-bar" data-testid="compare-bar">
      <span aria-live="polite">
        {list.length === 1 ? 'מוצר אחד נבחר להשוואה' : `${list.length} מוצרים נבחרו להשוואה`}
      </span>
      {list.length > 1 ? (
        <Link href="/products/compare" className="category-compare-bar__go">
          להשוואה
        </Link>
      ) : (
        <span className="category-compare-bar__hint">בחרו מוצר נוסף כדי להשוות</span>
      )}
      <button type="button" onClick={clear} className="category-compare-bar__clear">
        ניקוי
      </button>
    </div>
  )
}
