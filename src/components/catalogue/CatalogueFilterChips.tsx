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

/**
 * The filter row under the category chips: open on the weekend, free shipping,
 * under 99, newest. Four chips, no search field and no location chip.
 *
 * Every chip is a plain link that toggles one query parameter, for the reasons
 * `CategoryChips` gives: it works without JavaScript, survives a shared URL,
 * and a crawler can follow it. With no location chip the row needs no browser
 * API, so it is a server component with no client child and no Suspense.
 *
 * The first two filter on `products.open_weekend` and `products.free_shipping`
 * (262). "Under 99" and "newest" write `max=99` and `sort=newest`, the
 * parameters the price facet and the sort select already read, so the three
 * controls can only ever show one state. See `quickChipsFromParams`.
 *
 * Same classes as the category row, so the two rows are one design and the
 * 44px hit target is the same on both.
 *
 * This row replaced `components/category/FilterChips` on both archive pages in
 * S35. That file carries a fifth, "near me" chip and sits under the design
 * freeze, so it was left as it is and is no longer mounted.
 */
export default function CatalogueFilterChips({
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
  const chips = [
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
  return (
    <nav aria-label={t('filterChips.label')} className="category-chips category-chips--filters">
      <ul className="category-chips__list">
        {chips.map((chip) => (
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
        ))}
      </ul>
    </nav>
  )
}
