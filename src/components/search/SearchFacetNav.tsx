import { type FacetSection, buildFacetSections } from '@/lib/search/facet-links'
import type { FacetDistribution } from '@/lib/search/faceted'
import Link from 'next/link'

/**
 * Faceted navigation for the results page: links, counts, no input.
 *
 * A server component with no state. The facet counts come from the same
 * search that produced the grid (`facetedSearchCached`), so a count here is
 * a promise the grid keeps. Every option is a link to the URL that narrows
 * by it, and the selected option links back to the URL without it.
 *
 * Since UX21 this sits inside the `SearchFilters` disclosure under the
 * control bar, and the active chips moved out of it to `SearchActiveFilters`
 * above the grid, where the shopper can see what narrowed the page without
 * opening anything.
 */

type Props = {
  facets: FacetDistribution
  current: URLSearchParams
}

export default function SearchFacetNav({ facets, current }: Props) {
  const sections = buildFacetSections(facets, current)
  if (sections.length === 0) return null

  return (
    <nav className="search-facets" aria-label="סינון תוצאות החיפוש">
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
