import {
  type FacetSection,
  activeFacetChips,
  buildFacetSections,
  clearFacetsHref,
} from '@/lib/search/facet-links'
import type { FacetDistribution } from '@/lib/search/faceted'
import Link from 'next/link'

/**
 * Faceted navigation for the results page: links, counts, no input.
 *
 * A server component with no state. The facet counts come from the same
 * search that produced the grid (`facetedSearchCached`), so a count here is
 * a promise the grid keeps. Every option is a link to the URL that narrows
 * by it, the selected option links back to the URL without it, and the strip
 * of active chips at the top is the same set as links to their own removal.
 *
 * Rendered above the listing sidebar rather than inside its <details>,
 * because a facet is a decision about THIS result set and belongs in view;
 * the sidebar's price form and archive links are the general-purpose tools
 * the listing pages also carry, and stay collapsed as they do there.
 */

type Props = {
  facets: FacetDistribution
  current: URLSearchParams
}

export default function SearchFacetNav({ facets, current }: Props) {
  const sections = buildFacetSections(facets, current)
  const chips = activeFacetChips(current)
  if (sections.length === 0 && chips.length === 0) return null

  return (
    <nav className="search-facets" aria-label="סינון תוצאות החיפוש">
      {chips.length > 0 && (
        <div className="search-facets__active">
          <span className="search-facets__active-label">מסונן לפי:</span>
          <ul className="search-facets__chips">
            {chips.map((chip) => (
              <li key={chip.name}>
                <Link
                  href={chip.href}
                  className="search-facets__chip"
                  aria-label={`הסרת הסינון ${chip.label}: ${chip.valueLabel}`}
                >
                  {chip.label}: {chip.valueLabel}
                  <span aria-hidden="true"> ×</span>
                </Link>
              </li>
            ))}
            <li>
              <Link href={clearFacetsHref(current)} className="search-facets__clear">
                נקו הכל
              </Link>
            </li>
          </ul>
        </div>
      )}

      <div className="search-facets__sections">
        {sections.map((section) => (
          <FacetSectionView key={section.name} section={section} />
        ))}
      </div>
    </nav>
  )
}

function FacetSectionView({ section }: { section: FacetSection }) {
  return (
    <section className="search-facets__section" aria-labelledby={`facet-${section.name}`}>
      <h3 id={`facet-${section.name}`} className="search-facets__title">
        {section.label}
      </h3>
      <ul className="search-facets__list">
        {section.options.map((option) => (
          <li key={option.value}>
            <Link
              href={option.href}
              className={`search-facets__option${option.selected ? ' is-current' : ''}`}
              aria-current={option.selected ? 'true' : undefined}
            >
              <span className="search-facets__option-label">{option.label}</span>
              <span className="search-facets__count" aria-label={`${option.count} תוצאות`}>
                {option.count}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
