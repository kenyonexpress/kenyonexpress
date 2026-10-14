import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import SearchActiveFilters from './SearchActiveFilters'
import SearchFacetNav from './SearchFacetNav'

/**
 * UX21: the active-filter strip above the grid and the facet navigation
 * inside the disclosure. Measured before: the chips lived inside the facet
 * nav under the grid (y=1220 under an empty state at y=429 on a narrowed
 * search at 380), and a price range had no chip at all.
 */
describe('SearchActiveFilters', () => {
  it('renders nothing on an unfiltered search', () => {
    const { container } = render(
      <SearchActiveFilters current={new URLSearchParams('q=ספא&sort=newest')} />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('shows each facet and the price range as removable links, then a clear-all', () => {
    render(
      <SearchActiveFilters
        current={new URLSearchParams('q=ספא&type=coupon&city=חיפה&price_max=200')}
      />,
    )
    const nav = screen.getByRole('navigation', { name: 'סינונים פעילים' })
    expect(nav).toHaveAttribute('data-active-filters')
    const removeType = screen.getByRole('link', { name: 'הסרת הסינון סוג: קופונים' })
    const removeCity = screen.getByRole('link', { name: 'הסרת הסינון עיר: חיפה' })
    const removePrice = screen.getByRole('link', { name: /הסרת הסינון מחיר/ })
    expect(removeType.getAttribute('href')).not.toContain('type=')
    expect(removeType.getAttribute('href')).toContain('city=')
    expect(removeCity.getAttribute('href')).toContain('type=coupon')
    expect(removePrice.getAttribute('href')).not.toContain('price_max')
    expect(removePrice.getAttribute('href')).toContain('city=')
    expect(screen.getByRole('link', { name: 'נקו הכל' })).toHaveAttribute(
      'href',
      '/search?q=%D7%A1%D7%A4%D7%90',
    )
  })
})

describe('SearchFacetNav', () => {
  const facets = {
    type: { physical: 5, coupon: 2 },
    city: { 'תל אביב': 4, חיפה: 3 },
    in_stock: { true: 7 },
  }

  it('renders one section per facet with counts, no chips of its own', () => {
    const { container } = render(
      <SearchFacetNav facets={facets} current={new URLSearchParams('q=ספא&city=חיפה')} />,
    )
    expect(screen.getByRole('navigation', { name: 'סינון תוצאות החיפוש' })).toBeInTheDocument()
    expect(container.querySelector('.search-facets__active')).toBeNull()
    expect(
      [...container.querySelectorAll('.search-facets__title')].map((t) => t.textContent),
    ).toEqual(['סוג', 'עיר', 'זמינות'])
    const current = screen.getByRole('link', { name: /חיפה/ })
    expect(current).toHaveAttribute('aria-current', 'true')
    expect(current.getAttribute('href')).not.toContain('city=')
    expect(screen.getByRole('link', { name: /תל אביב/ }).getAttribute('href')).toContain('city=')
  })

  it('renders nothing when the engine found no facets', () => {
    const { container } = render(
      <SearchFacetNav facets={{}} current={new URLSearchParams('q=x')} />,
    )
    expect(container.innerHTML).toBe('')
  })
})
