import { buildSortOptions } from '@/lib/search/facet-links'
import Link from 'next/link'

/**
 * The order of the results, as links. No <select> and no input: the site
 * ships no search field (layout/no-search-ui.test.ts), and an order is a URL
 * like a facet is, so choosing one is a navigation and the page stays a
 * server component.
 *
 * Everything here depends on the URL alone, never on the results, so it
 * renders with the page shell rather than behind a boundary. `pending` draws
 * the same box with nothing visible or focusable in it: the static shell and
 * a page with no query both reserve the line, and nothing shifts when the
 * real control replaces it.
 */

type Props = {
  current: URLSearchParams
  pending?: boolean
}

export default function SearchSortNav({ current, pending = false }: Props) {
  const options = buildSortOptions(current)
  return (
    <nav
      className={pending ? 'search-facets__active search-sort--pending' : 'search-facets__active'}
      aria-label="מיון תוצאות החיפוש"
      aria-hidden={pending || undefined}
      inert={pending || undefined}
    >
      <ul className="search-facets__chips">
        {options.map((option) => (
          <li key={option.value ?? 'relevance'}>
            <Link
              href={option.href}
              className={option.selected ? 'search-facets__chip is-current' : 'search-facets__chip'}
              aria-current={option.selected ? 'true' : undefined}
            >
              {option.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
