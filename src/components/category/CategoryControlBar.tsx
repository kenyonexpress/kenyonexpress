'use client'

import { useCatalogView } from '@/components/category/CatalogViewProvider'
import { CATALOG_VIEW_LABELS, type CatalogView } from '@/lib/catalog-view'
import {
  ORDERBY_TO_SORT,
  SORT_SELECT_OPTIONS,
  SORT_TO_ORDERBY,
  type SortValue,
} from '@/lib/category-tokens'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'

export type { SortValue }

/**
 * The two views, with live's glyphs: `fa-th` (the 3x3 grid) for the grid and
 * `fa-list` (bars with squares) for the list. Live's switcher carries four
 * tabs, two of which (`grid-extended`, `list-view-small`) are density
 * variants of these two; see the note on `ViewSwitcher`.
 */
const VIEW_OPTIONS: { value: CatalogView; path: string }[] = [
  {
    value: 'grid',
    path: 'M1 1h4v4H1zM6 1h4v4H6zM11 1h4v4h-4zM1 6h4v4H1zM6 6h4v4H6zM11 6h4v4h-4zM1 11h4v4H1zM6 11h4v4H6zM11 11h4v4h-4z',
  },
  {
    value: 'list',
    path: 'M1 2h3v3H1zM5 3h11v1H5zM1 7h3v3H1zM5 8h11v1H5zM1 12h3v3H1zM5 13h11v1H5z',
  },
]

/**
 * THE VIEW SWITCHER IS REAL NOW (UX14).
 *
 * Measured before (logs/ux14/before.json, every width): four `<span>`s under
 * `aria-hidden="true"`, the first painted active, none of them doing anything
 * -- the live bar's shape with nothing behind it. Now two `<button>`s in a
 * named group, `aria-pressed` on the chosen one, writing the choice to
 * `localStorage` through `CatalogViewProvider`; the card re-renders as a row
 * and the stylesheet lays the `<ul>` out as rows off `data-view`.
 *
 * Two and not four: live's extra two tabs are density variants (a denser
 * grid, a smaller list) of the same two layouts, and offering four states for
 * two layouts would be two more controls that change nothing. The switcher
 * measures 58px wide instead of live's 116; it sits on the inline-start of a
 * `space-between` bar, so nothing else in the bar moves.
 *
 * Desktop and tablet only, like live's `.shop-view-switcher`, which is
 * `display:none` below 768: at 380 the bar holds the filters link and the
 * sort pill, and the grid is already two columns.
 */
export function ViewSwitcher() {
  const { view, setView } = useCatalogView()
  return (
    <fieldset className="category-view-switcher">
      <legend className="sr-only">תצוגת המוצרים</legend>
      {VIEW_OPTIONS.map((option) => {
        const active = view === option.value
        return (
          <button
            key={option.value}
            type="button"
            className={`category-view-switcher__btn tap-area${active ? ' is-active' : ''}`}
            aria-pressed={active}
            aria-label={CATALOG_VIEW_LABELS[option.value]}
            title={CATALOG_VIEW_LABELS[option.value]}
            data-view={option.value}
            onClick={() => setView(option.value)}
          >
            <svg viewBox="0 0 17 17" width={16} height={16} fill="currentColor" aria-hidden="true">
              <path d={option.path} />
            </svg>
          </button>
        )
      })}
    </fieldset>
  )
}

export default function CategoryControlBar({
  value,
  activeFilterCount = 0,
}: {
  value: SortValue
  /** How many facets narrow this page; shown on the phone's filters link. */
  activeFilterCount?: number
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const orderbyValue = SORT_TO_ORDERBY[value] ?? 'menu_order'

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const orderby = e.target.value
    const sort = ORDERBY_TO_SORT[orderby] ?? 'menu_order'
    const params = new URLSearchParams(searchParams)
    if (sort === 'menu_order') params.delete('sort')
    else params.set('sort', sort)
    params.delete('page')
    const qs = params.toString()
    startTransition(() => {
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    })
  }

  return (
    <div className="category-control-bar" aria-busy={isPending || undefined}>
      {/* Phone only; the view switcher below owns this slot from 768 up.

          FIRST in the DOM, which in this space-between RTL bar means the
          RIGHT. D24 moved it after the sort on a hand re-measurement of live
          that said the opposite; every stored reference disagrees with that
          measurement and they all agree with each other:
          refs/ke_live_products.html puts .handheld-sidebar-toggle first in
          .shop-control-bar (itself flex space-between), and
          refs/ke_live_computed.json measures it at x281 (right) with
          select.orderby at x35 (left) on both /products and /category at 380.
          category-page.css said the same all along. The stored capture is the
          project's mandated visual source, so filters-first is restored.

          The count (UX14) says how many facets are already narrowing the page,
          because the panel it points at is closed and below the grid. */}
      <a className="category-control-bar__filters" href="#category-filters">
        <svg viewBox="0 0 20 20" width={18} height={18} aria-hidden="true" fill="currentColor">
          <path d="M2 5h9a2.5 2.5 0 0 0 4.9 0H18v2h-2.1a2.5 2.5 0 0 0-4.9 0H2V5Zm0 8h4.1a2.5 2.5 0 0 1 4.9 0h7v2h-7a2.5 2.5 0 0 1-4.9 0H2v-2Z" />
        </svg>
        סינון
        {activeFilterCount > 0 && (
          <>
            <span className="sr-only"> סינונים פעילים: </span>
            <span className="category-control-bar__filters-count">{activeFilterCount}</span>
          </>
        )}
      </a>
      <ViewSwitcher />
      <div className="category-control-bar__sort">
        <label className="sr-only" htmlFor="category-orderby">
          מיון מוצרים
        </label>
        <select
          id="category-orderby"
          name="orderby"
          className="category-control-bar__select"
          value={orderbyValue}
          onChange={handleChange}
          disabled={isPending}
          aria-label="מיון מוצרים"
        >
          {SORT_SELECT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
