'use client'

import type { Suggestion } from '@/lib/search/suggestions'
import Link from 'next/link'

function shekels(value: number | null): string | null {
  if (value == null) return null
  return `₪${value.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/**
 * The dropdown body. Split out of HeaderSearch so the fetching and the
 * rendering can be read separately, and so the list has one place that decides
 * what an empty result looks like: a row saying nothing matched, never an empty
 * box. A box that opens onto nothing reads as a broken control.
 *
 * These are links in a list, and they are marked up as links in a list. The
 * combobox/listbox pattern was the first shape tried and it is the wrong one
 * here: `role="option"` on an anchor takes away the link semantics a screen
 * reader user needs to know that Enter navigates, and it is what a11y linting
 * objects to. The active row carries `aria-current` and the arrow keys move it;
 * nothing about that requires borrowing a widget role.
 */
export default function SearchSuggestions({
  suggestions,
  loading,
  activeIndex,
  query,
  onPick,
  listId,
  optionId,
}: {
  suggestions: Suggestion[]
  loading: boolean
  activeIndex: number
  query: string
  onPick: () => void
  listId: string
  optionId: (index: number) => string
}) {
  const trimmed = query.trim()
  const showEmpty = !loading && suggestions.length === 0 && trimmed.length >= 2

  return (
    <div className="header-suggest__panel">
      <ul className="header-suggest__list" id={listId}>
        {suggestions.map((item, index) => (
          <li key={item.id}>
            <Link
              href={`/product/${item.slug}`}
              id={optionId(index)}
              aria-current={index === activeIndex ? true : undefined}
              data-active={index === activeIndex ? '' : undefined}
              className="header-suggest__item"
              onClick={onPick}
            >
              <span className="header-suggest__name">{item.name_he}</span>
              {item.price != null && (
                <span className="header-suggest__price">{shekels(item.price)}</span>
              )}
            </Link>
          </li>
        ))}
      </ul>

      {showEmpty && <p className="header-suggest__empty">לא נמצאו מוצרים תואמים</p>}

      {suggestions.length > 0 && (
        <Link
          href={`/search?q=${encodeURIComponent(trimmed)}`}
          className="header-suggest__all"
          onClick={onPick}
        >
          לכל התוצאות עבור &quot;{trimmed}&quot;
        </Link>
      )}
    </div>
  )
}
