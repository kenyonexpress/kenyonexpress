import NearMeChip from '@/components/geo/NearMeChip'
import {
  type ChipFilters,
  OPEN_PARAM,
  SHIPPING_PARAM,
  newestChipHref,
  quickChipsFromParams,
  toggleChipHref,
  under99ChipHref,
} from '@/lib/catalogue/filter-chips'
import { t } from '@/lib/i18n/messages'
import Link from 'next/link'
import { Suspense } from 'react'

/**
 * The filter row under the category chips: open on the weekend, free shipping,
 * near me, under 99, newest. No search field; these five are the whole of
 * "narrow this page".
 *
 * Four are plain links that toggle one query parameter, for the same reasons
 * `CategoryChips` gives: they work without JavaScript, survive a shared URL,
 * and a crawler can follow them. "Near me" needs the browser and asks for
 * consent on click, so it is the one client component in the row, inside its
 * own Suspense because `useSearchParams` cannot be prerendered.
 *
 * "Under 99" and "newest" write `max=99` and `sort=newest`, the parameters the
 * price facet and the sort select already read, so the three controls can only
 * ever show one state. See `quickChipsFromParams`.
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
  const quick = quickChipsFromParams(params)
  const before = [
    {
      href: toggleChipHref(pathname, params, OPEN_PARAM, 'weekend'),
      active: Boolean(filters.openWeekend),
      label: t('filterChips.openWeekend'),
      testId: 'filter-chip-weekend',
    },
    {
      href: toggleChipHref(pathname, params, SHIPPING_PARAM, 'free'),
      active: Boolean(filters.freeShipping),
      label: t('filterChips.freeShipping'),
      testId: 'filter-chip-shipping',
    },
  ]
  const after = [
    {
      href: under99ChipHref(pathname, params),
      active: quick.under99,
      label: t('filterChips.under99'),
      testId: 'filter-chip-under99',
    },
    {
      href: newestChipHref(pathname, params),
      active: quick.newest,
      label: t('filterChips.newest'),
      testId: 'filter-chip-newest',
    },
  ]
  const link = (chip: (typeof before)[number]) => (
    <li key={chip.testId}>
      <Link
        href={chip.href}
        className="category-chips__chip"
        aria-current={chip.active ? 'true' : undefined}
        data-testid={chip.testId}
      >
        {chip.label}
      </Link>
    </li>
  )
  return (
    <nav aria-label={t('filterChips.label')} className="category-chips category-chips--filters">
      <ul className="category-chips__list">
        {before.map(link)}
        <li>
          <Suspense fallback={null}>
            <NearMeChip />
          </Suspense>
        </li>
        {after.map(link)}
      </ul>
    </nav>
  )
}
