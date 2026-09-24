import NearMeChip from '@/components/geo/NearMeChip'
import {
  type ChipFilters,
  OPEN_PARAM,
  SHIPPING_PARAM,
  toggleChipHref,
} from '@/lib/catalogue/filter-chips'
import { t } from '@/lib/i18n/messages'
import Link from 'next/link'
import { Suspense } from 'react'

/**
 * The filter row under the category chips: open on the weekend, free shipping,
 * near me.
 *
 * The first two are plain links that toggle one query parameter, for the same
 * reasons `CategoryChips` gives: they work without JavaScript, survive a shared
 * URL, and a crawler can follow them. The third needs the browser and asks for
 * consent on click, so it is the one client component in the row, inside its
 * own Suspense because `useSearchParams` cannot be prerendered.
 *
 * Same classes as the category row, so the two rows are one design and the
 * 44px hit target is the same on both.
 */
export default function FilterChips({
  pathname,
  params,
  filters,
}: {
  pathname: string
  /** The current query, as the page's links carry it (sort, price, type, chips). */
  params: Record<string, string | undefined>
  filters: ChipFilters
}) {
  const chips = [
    {
      key: OPEN_PARAM,
      value: 'weekend',
      active: Boolean(filters.openWeekend),
      label: t('filterChips.openWeekend'),
      testId: 'filter-chip-weekend',
    },
    {
      key: SHIPPING_PARAM,
      value: 'free',
      active: Boolean(filters.freeShipping),
      label: t('filterChips.freeShipping'),
      testId: 'filter-chip-shipping',
    },
  ]
  return (
    <nav aria-label={t('filterChips.label')} className="category-chips category-chips--filters">
      <ul className="category-chips__list">
        {chips.map((chip) => (
          <li key={chip.key}>
            <Link
              href={toggleChipHref(pathname, params, chip.key, chip.value)}
              className="category-chips__chip"
              aria-current={chip.active ? 'true' : undefined}
              data-testid={chip.testId}
            >
              {chip.label}
            </Link>
          </li>
        ))}
        <li>
          <Suspense fallback={null}>
            <NearMeChip />
          </Suspense>
        </li>
      </ul>
    </nav>
  )
}
